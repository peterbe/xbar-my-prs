import { formatDistance } from "date-fns/formatDistance";
import { Octokit } from "octokit";
import { getGlobalConfig } from "./config";

const DEFAULT_TIMEOUT = 5000;

export class TimeoutError extends Error {}

export type PrReviewInfo = {
	reviewer: string;
	state: string;
	submitted_at: Date;
};

export type PrInfo = {
	title: string;
	body: string;
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
	labels: {
		name: string;
	}[];
};

export type PrInfoGroups = Record<"open" | "closed", PrInfo[]>;

export async function getPrs(): Promise<PrInfoGroups> {
	const octokit = await getOctokit();

	const prs = await getOpenPRsByAuthorSearch(octokit, {
		sort: "updated",
		// This omits really old ones
		maxSecondsAgo: 30 * 24 * 60 * 60, // 1 month ago minimum
	});
	const openPrs = prs.filter((pr) => pr.state === "open");

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
	const recentlyClosedPrs = prs
		.filter((pr) => pr.state === "closed")
		.filter((pr) => {
			// Closed within the last 5 minutes
			return pr.updated_at_ago_seconds < 5 * 60;
		});

	return {
		open: openPrs,
		closed: recentlyClosedPrs,
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
	options: SearchOptions = {},
	timeout: number = DEFAULT_TIMEOUT,
): Promise<PrInfo[]> {
	const qualifiers = ["is:pr", `author:@me`];

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

	const controller = new AbortController();
	const signal = controller.signal;
	const timeoutId = setTimeout(() => {
		controller.abort();
	}, timeout);

	const q = qualifiers.join(" ");
	try {
		const response = await octokit.request("GET /search/issues", {
			q,
			request: {
				signal,
			},
		});
		clearTimeout(timeoutId);
		if (response.data.incomplete_results) {
			console.log(response.data);
			console.warn("Warning: The search results may be incomplete.");
		}
		// console.log(response.data.items[0]);
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
					body: item.body || "",
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
					labels: item.labels as { name: string }[],
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
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new TimeoutError(`Timed out after ${timeout}ms`);
		}
		throw error;
	}
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
}
