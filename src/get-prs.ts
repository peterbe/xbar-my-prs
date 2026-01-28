import { formatDistance } from "date-fns/formatDistance";
import { Octokit } from "octokit";
import { getGlobalConfig } from "./config";

export type PrReviewInfo = {
	reviewer: string;
	state: string;
	submitted_at: Date;
};

export type PrInfo = {
	title: string;
	state: string;
	url: string;
	draft?: boolean;
	updated_at: string;
	updated_at_human: string;
	updated_at_ago_seconds: number;
	pull_number: number;
	reviews: PrReviewInfo[];
	number_of_comments: number;
	org: string;
	repo: string;
};

export type PrInfoGroups = Record<"open" | "closed", PrInfo[]>;

export async function getPrs(): Promise<PrInfoGroups> {
	const octokit = await getOctokit();

	const { username } = await getGlobalConfig();
	const openPrs = await getOpenPRsByAuthorSearch(octokit, username, {
		sort: "updated",
		maxSecondsAgo: 30 * 24 * 60 * 60, // 1 month ago minimum
	});
	const reviews = await Promise.all(
		openPrs.map((pr) => {
			return getPullRequestReviews(octokit, pr.org, pr.repo, pr.pull_number);
		}),
	);

	openPrs.forEach((pr, index) => {
		const prReviews = reviews[index];
		if (prReviews) {
			pr.reviews = prReviews.map((review) => {
				return {
					reviewer: review.user?.login || "unknown",
					state: review.state,
					submitted_at: new Date(review.submitted_at as string),
				};
			});
		}
	});

	const recentlyClosedPrs = await getOpenPRsByAuthorSearch(octokit, username, {
		sort: "updated",
		maxSecondsAgo: 30 * 60,
		state: "closed",
	});

	return {
		open: openPrs,
		closed: recentlyClosedPrs.map((pr) => ({ ...pr, reviews: [] })),
	};
}

async function getOctokit() {
	const { token } = await getGlobalConfig();
	if (!token) {
		throw new Error(
			"You have not set up a GitHub Personal Access Token. Run `github token`.",
		);
	}

	const octokit = new Octokit({ auth: token });
	return octokit;
}

type SearchOptions = {
	// Limit search to an org or a specific repo if desired
	org?: string;
	repo?: { owner: string; name: string };
	sort?: "created" | "updated"; // Search sorting
	order?: "asc" | "desc";
	maxSecondsAgo?: number;
	state?: "open" | "closed";
};

/**
 * Get all open PRs authored by `author` using the Search API.
 * Works across all public repos, or scoped to an org or a repo via qualifiers.
 *
 * Note: "author" is the PR creator, not the commit author.
 * For private repos, your token needs appropriate scopes (e.g. repo).
 */
export async function getOpenPRsByAuthorSearch(
	octokit: Octokit,
	author: string,
	options: SearchOptions = {},
): Promise<PrInfo[]> {
	const qualifiers = [
		"is:pr",
		`is:${options.state || "open"}`,
		`author:${author}`,
	];

	if (options.org) {
		qualifiers.push(`org:${options.org}`);
	}
	if (options.repo) {
		qualifiers.push(`repo:${options.repo.owner}/${options.repo.name}`);
	}
	if (options.maxSecondsAgo) {
		const date = new Date(Date.now() - options.maxSecondsAgo * 1000);
		const isoDate = date.toISOString().split("T")[0]; // YYYY-MM-DD
		qualifiers.push(`updated:>=${isoDate}`);
	}

	const q = qualifiers.join(" ");
	const response = await octokit.request("GET /search/issues", { q });
	if (response.data.incomplete_results) {
		console.log(response.data);
		console.warn("Warning: The search results may be incomplete.");
	}
	const found = response.data.items
		.map((item) => {
			const updatedAt = new Date(item.updated_at);

			const url = new URL(item.html_url);
			const [, org, repo] = url.pathname.split("/");
			if (!org) throw new Error("Could not parse org from PR URL");
			if (!repo) throw new Error("Could not parse repo from PR URL");

			const info: PrInfo = {
				pull_number: item.number,
				number_of_comments: item.comments,
				title: item.title,
				url: item.html_url,
				state: item.state,
				draft: item.draft,
				updated_at_ago_seconds: (Date.now() - updatedAt.getTime()) / 1000,
				updated_at: item.updated_at,
				updated_at_human: formatDistance(updatedAt, new Date(), {
					addSuffix: true,
				}),
				org,
				repo,
				reviews: [],
			};
			return info;
		})
		.filter((pr) => {
			if (!options.maxSecondsAgo) return true;

			return pr.updated_at_ago_seconds < options.maxSecondsAgo;
		})
		.sort((a, b) => a.updated_at_ago_seconds - b.updated_at_ago_seconds);

	return found;
}

async function getPullRequestReviews(
	octokit: Octokit,
	owner: string,
	repo: string,
	pull_number: number,
) {
	const { data: reviews } = await octokit.rest.pulls.listReviews({
		owner,
		repo,
		pull_number,
	});
	return reviews;

	// console.log(`Reviews for pull request #${pull_number}:`);
	// reviews.forEach((review) => {
	// 	console.log(
	// 		`- Review by: ${review.user.login}, State: ${review.state}, Body: ${review.body}`,
	// 	);
	// });

	// // To get a complete list of reviewers (both submitted and requested),
	// // you might also want to list requested reviewers
	// const { data: requestedReviewers } =
	// 	await octokit.rest.pulls.listRequestedReviewers({
	// 		owner,
	// 		repo,
	// 		pull_number,
	// 	});

	// console.log(`\nRequested reviewers for pull request #${pull_number}:`);
	// requestedReviewers.forEach((reviewer) => {
	// 	console.log(`- Requested reviewer: ${reviewer.login}`);
	// });
}
