import type { PrInfo, PrInfoGroups, PrReviewInfo } from "./get-prs";

const MEMORY_FILE = "/tmp/xbar-prs.json";

export async function getPrsBefore(): Promise<PrInfoGroups | null> {
	const memoryFile = Bun.file(MEMORY_FILE);
	if (await memoryFile.exists()) {
		return await memoryFile.json();
	}
	return null;
}

export async function savePrs(groups: PrInfoGroups): Promise<void> {
	const memoryFile = Bun.file(MEMORY_FILE);
	await memoryFile.write(JSON.stringify(groups, undefined, 2));
}

export function comparePrInfoGroups(
	groups: PrInfoGroups,
	groupsBefore: PrInfoGroups,
) {
	const alerts: string[] = [];
	if (groupsBefore) {
		for (const status of ["open", "closed"] as const) {
			const beforeCount = groupsBefore[status].length;
			const afterCount = groups[status].length;
			if (afterCount > beforeCount) {
				const recentlyRemovedOrAdded = groups[status].filter((pr) => {
					return !groupsBefore[status].some(
						(prBefore) => prBefore.pull_number === pr.pull_number,
					);
				});
				// console.log({ recentlyRemoved });
				if (status === "open") {
					alerts.push(
						`Opened: ${recentlyRemovedOrAdded.map((pr) => `"${pr.title}"`).join(", ")}`,
					);
				} else {
					alerts.push(
						`Closed: ${recentlyRemovedOrAdded.map((pr) => `"${pr.title}"`).join(", ")}`,
					);
					// console.log({ status }, recentlyRemovedOrAdded, "???");
				}

				// if (status !== "closed") {
				// 	alerts.push(
				// 		`No longer open: ${recentlyRemovedOrAdded.map((pr) => `"${pr.title}"`).join(", ")}`,
				// 	);
				// }
			} else {
				groups[status].forEach((pr, index) => {
					const prBefore = groupsBefore[status][index];
					if (!prBefore) return;

					for (const [key, value] of Object.entries(pr)) {
						if (key === "reviews") {
							alerts.push(
								...compareReviews(pr, value as PrReviewInfo[], prBefore[key]),
							);
						}
						if (Array.isArray(value)) continue;

						if (typeof value === "string" && key in prBefore) {
							if (key === "updated_at_human") continue;

							const beforeValue = prBefore[key as keyof PrInfo];
							if (value !== beforeValue) {
								if (key === "updated_at") {
									alerts.push(`PR "${shortTitle(pr.title)}" updated`);
								} else {
									console.log({ key, value, beforeValue });
									alerts.push(
										`PR "${shortTitle(pr.title)}" changed ${key} from "${beforeValue}" to "${value}"`,
									);
								}
							}
						}
					}
				});
			}
		}
	}

	return alerts;
}

function compareReviews(
	pr: PrInfo,
	reviews: PrReviewInfo[],
	reviewsBefore: PrReviewInfo[],
) {
	const alerts: string[] = [];
	const reviewsFlat = reviews.map((r) => JSON.stringify(r));
	const reviewsBeforeFlat = reviewsBefore.map((r) => JSON.stringify(r));
	reviewsFlat.forEach((reviewFlat, index) => {
		if (reviewFlat !== reviewsBeforeFlat[index]) {
			const review = reviews[index];
			if (!review) return;
			alerts.push(
				`${review.reviewer} ${review.state} on "${shortTitle(pr.title)}"`,
			);
		}
	});
	return alerts;
}

function shortTitle(title: string, maxLength = 50): string {
	if (title.length > maxLength) {
		return `${title.slice(0, maxLength - 3)}...`;
	}
	return title;
}
