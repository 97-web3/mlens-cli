import type { AppProfile } from "../config.ts";

export const MOLIAN_APP_PROFILE: AppProfile = {
	id: "mlens",
	appName: "mlens",
	appTitle: "墨链 链镜",
	configDirName: ".molian",
	exportNamePrefix: "mlens",
	helpTagline: "墨链链上公共地址分析 Agent",
	onboardingBlurb:
		"墨链链镜会优先基于链上工具收集事实。可用 /report <address> <chain> 或自然语言发起单地址单链资产证明报告流程。",
	latestReleaseApiUrl: "https://api.github.com/repos/97-web3/mlens-cli/releases/latest",
	latestReleaseApiAccept: "application/vnd.github+json",
	releasesPageUrl: "https://github.com/97-web3/mlens-cli/releases/latest",
	installCommand: "curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash",
	releaseBinarySelfUpdate: {
		repo: "97-web3/mlens-cli",
		binaryName: "mlens",
		archivePrefix: "mlens",
	},
};
