import { test as base, expect } from "@playwright/test";
import { observeAudio } from "../e2e/helpers";
import { FakeStack } from "./fake-stack";

export const test = base.extend<{ stack: FakeStack }>({
  stack: async ({ context, page }, applyFixture) => {
    const stack = new FakeStack();
    await stack.install(context, "host");
    await observeAudio(page);
    await applyFixture(stack);
    stack.assertNoUnexpectedRequests();
  },
});
export { expect };
