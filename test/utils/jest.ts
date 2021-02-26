export function collectGarbage(): void {
	if (global.gc) global.gc()
}

export enum TestType {
	LOCAL,
	REMOTE
}