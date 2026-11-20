import { describe, expect, it } from "vitest";
import { mockAwsFetch } from "../src/server/aws/mock";
import { getAccount, sendRaw } from "../src/server/aws/ses";
import { callerAccount, createTopic } from "../src/server/aws/sns";

const setup = () => {
	const applied: { type: string; to: string }[] = [];
	const fetcher = mockAwsFetch(
		async (e) => {
			const ev = e as { eventType: string; mail: { destination: string[] } };
			applied.push({ type: ev.eventType, to: ev.mail.destination[0] ?? "" });
		},
		0,
		() => {},
	);
	const aws = {
		region: "us-east-1",
		credentials: { accessKeyId: "x", secretAccessKey: "y" },
		fetcher,
	};
	return { aws, applied };
};
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("AWS_MOCK", () => {
	it("answers the account as out of the sandbox, and the query APIs", async () => {
		const { aws } = setup();
		expect((await getAccount(aws)).ProductionAccessEnabled).toBe(true);
		expect(await callerAccount(aws)).toBe("000000000000");
		expect(await createTopic(aws, "mailroom")).toContain(":mailroom");
	});

	it("turns the simulator's local parts into SES events", async () => {
		const cases: [string, string[]][] = [
			["someone@example.com", ["Delivery"]],
			["bounce@example.com", ["Bounce"]],
			["complaint@example.com", ["Delivery", "Complaint"]],
		];
		for (const [to, want] of cases) {
			const { aws, applied } = setup();
			const id = await sendRaw(aws, { raw: "eA==", from: "a@b.co", to: [to] });
			expect(id).toMatch(/^0100-mock-/);
			await settle();
			expect(applied.map((a) => a.type)).toEqual(want);
		}
	});
});
