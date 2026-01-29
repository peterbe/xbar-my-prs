import { styleText } from "node:util";
import { Command } from "commander";
import {
	getPrs,
	type PrInfo,
	type PrInfoGroups,
	TimeoutError,
} from "./get-prs";
import { comparePrInfoGroups, getPrsBefore, savePrs } from "./memory";

const isTTY = !!process.stdout.isTTY;

const program = new Command();

program.action(async () => {
	try {
		const groups = await getPrs();

		const groupsBefore = await getPrsBefore();

		const alerts: string[] = [];
		if (groupsBefore) {
			alerts.push(...comparePrInfoGroups(groups, groupsBefore));
		}

		let title = "";
		if (groups.open.length === 1) {
			const drafts = groups.open.some((pr) => pr.draft);
			if (drafts) {
				title = "1 PR";
			} else {
				title = "1 Open PR";
			}
		} else if (!groups.open.length) {
			title = "No PRs";
		} else {
			const drafts = groups.open.some((pr) => pr.draft);
			if (drafts) {
				title = `${groups.open.length} PRs`;
			} else {
				title = `${groups.open.length} Open PRs`;
			}
		}
		if (groups.closed.length > 0) {
			title += `, ${groups.closed.length} Recently Closed`;
		}

		output({ title, groups, alerts });

		await savePrs(groups);
	} catch (error) {
		if (error instanceof Error && error instanceof TimeoutError) {
			outputError({ msg: "timed out" });
		} else {
			throw error;
		}
	}
});

program.parse();

const MAX_TITLE_LENGTH = 80;

function output({
	title,
	groups,
	alerts,
}: {
	title: string;
	groups: PrInfoGroups;
	alerts: string[];
}) {
	for (const alert of alerts) {
		console.log(`🎵 ${alert}`);
	}

	console.log(title);
	if (groups.closed.length > 0 || groups.open.length > 0) {
		console.log("---");
	}

	if (groups.closed.length > 0) {
		console.log(`Recently Closed PRs (${groups.closed.length})`);
		for (const pr of groups.closed) {
			printPrInfo(pr);
		}
		console.log("---");
		if (groups.open.length > 0) {
			console.log(`Open PRs (${groups.open.length})`);
			console.log("---");
		}
	}
	for (const pr of groups.open) {
		printPrInfo(pr);
	}

	// console.log("----"); // CREATES A NEW SUBM MENU
	console.log("---");
	console.log(`All Your Pull Requests | href=${allSearchURL()}`);
}

function outputError({ msg }: { msg: string }) {
	console.log(colorize(`My PRs failed (${msg})`, "orange"));
}

function colorize(msg: string | string[], color: "green" | "orange") {
	const combined = Array.isArray(msg) ? msg.map(String).join(" ") : msg;
	if (isTTY) {
		// debugging in your terminal or something
		const recognizedColor = color === "orange" ? "yellow" : color;
		return styleText(recognizedColor, combined);
	} else {
		// actually in xbar
		return `${combined} | color=${color}`;
	}
}

function printPrInfo(pr: PrInfo) {
	const color: string | null = null;
	// if (pr.state === "open") {
	// 	color = "green";
	// } else if (pr.state === "closed") {
	// 	color = "red";
	// } else if (pr.state === "merged") {
	// 	color = "purple";
	// }
	let title = pr.updated_at_human.replace("about ", "");
	title += " > ";
	if (pr.draft) {
		title += "(Draft) ";
	}
	title += pr.title;
	if (title.length > MAX_TITLE_LENGTH) {
		title = `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`;
	}
	if (
		pr.reviews.some(
			(review) =>
				review.state === "CHANGES_REQUESTED" || review.state === "APPROVED",
		)
	) {
		title += "  ";
	}

	// You might have 3 reviews, some from the same user.
	// We only want the latest here
	const byUserLatest: Record<string, string> = {};
	for (const review of pr.reviews) {
		if (review.state === "CHANGES_REQUESTED" || review.state === "APPROVED") {
			byUserLatest[review.reviewer] = review.state;
		}
	}
	for (const state of Object.values(byUserLatest)) {
		if (state === "CHANGES_REQUESTED") {
			title += "❌";
		} else if (state === "APPROVED") {
			title += "✅";
		}
	}
	console.log(`${title} | href=${pr.url}${color ? ` color=${color}` : ""}`);
	// TODO FIGURE OUT HOW TO SHOW REVIEWS IN THE MENU
	// if (pr.reviews.length > 0) {
	// 	// console.log("----");
	// 	console.log(`-- ${pr.reviews.length} reviews`);
	// }
}

function allSearchURL() {
	const sp = new URLSearchParams({
		q: "is:pr is:open author:@me sort:updated",
		type: "pullrequests",
	});
	return `https://github.com/search?${sp.toString()}`;
}
