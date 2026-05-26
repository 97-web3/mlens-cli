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
};
