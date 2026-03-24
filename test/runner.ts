export interface TestCase {
    name: string;
    run(): Promise<void> | void;
}

export async function runCases(suiteName: string, cases: TestCase[]) {
    console.log(`# ${suiteName}`);

    for (const testCase of cases) {
        try {
            await testCase.run();
            console.log(`ok - ${testCase.name}`);
        } catch (error) {
            console.error(`not ok - ${testCase.name}`);
            throw error;
        }
    }
}
