import { homedir } from "node:os";
import { sep } from "node:path";

const CONFIG_FILE_PATH = "~/.xbar-github.json";

type GlobalConfig = {
	token: string;
	username: string;
};

export async function getGlobalConfig(): Promise<GlobalConfig> {
	const db = Bun.file(expandPath(CONFIG_FILE_PATH));
	if (!(await db.exists())) {
		throw new Error(`Global config file not found: ${CONFIG_FILE_PATH}`);
	}
	const parsed = JSON.parse(await db.text());

	const username = parsed.username as string | undefined;
	const token = parsed.token as string | undefined;

	if (!token) {
		throw new Error(`The file ${CONFIG_FILE_PATH} is missing the key "token".`);
	}
	if (!username) {
		throw new Error(
			`The file ${CONFIG_FILE_PATH} is missing the key "username".`,
		);
	}

	return {
		token,
		username,
	};
}

function expandPath(path: string): string {
	const split = path.split(sep);
	return split
		.map((part) => {
			if (part === "~") {
				return homedir();
			}
			return part;
		})
		.join(sep);
}
