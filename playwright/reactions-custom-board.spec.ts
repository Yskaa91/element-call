/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  type Browser,
  type Page,
  type Request,
  test,
} from "@playwright/test";

import { SpaHelpers } from "./spa-helpers";

async function interceptEventSend(
  page: Page,
  eventType: string,
  callback: (request: Request) => void,
): Promise<void> {
  await page.route(
    `**/_matrix/client/v3/rooms/**/send/${eventType}/**`,
    async (route, req) => {
      callback(req);
      return route.continue();
    },
  );
}

async function setupTwoUserSpaCall(
  browser: Browser,
  page: Page,
  browserName: string,
): Promise<{ guestPage: Page }> {
  test.skip(
    browserName === "firefox",
    "No mic/audio device inputs in the firefox CI environment",
  );
  await page.goto("/");
  await SpaHelpers.createCall(page, "Androl", "HelloCall", true, "2_0");
  const inviteLink = await SpaHelpers.getCallInviteLink(page);
  const guestInviteeContext = await browser.newContext({
    reducedMotion: "reduce",
  });
  const guestPage = await guestInviteeContext.newPage();
  await guestPage.goto("/");
  await SpaHelpers.joinCallFromInviteLink(
    guestPage,
    inviteLink,
    "Pevara",
    "2_0",
  );
  return { guestPage };
}

test("Reactions menu sends the reaction event with emoji and name", async ({
  browser,
  page,
  browserName,
}) => {
  await setupTwoUserSpaCall(browser, page, browserName);
  await SpaHelpers.expectVideoTilesCount(page, 2);

  const sent: unknown[] = [];
  const seen = Promise.withResolvers<void>();
  await interceptEventSend(page, "io.element.call.reaction", (req) => {
    sent.push(req.postDataJSON());
    seen.resolve();
  });

  await page.getByLabel("Reactions").click();
  await page.getByText("🐶").click();
  await seen.promise;
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ emoji: "🐶", name: "dog" });
});

test("Reactions menu hides board editing without a space board", async ({
  browser,
  page,
  browserName,
}) => {
  await setupTwoUserSpaCall(browser, page, browserName);
  await SpaHelpers.expectVideoTilesCount(page, 2);

  // Standalone calls have no space parent, so the board is unavailable:
  // built-ins work, but no pencil and no add button may appear.
  await page.getByLabel("Reactions").click();
  await expect(page.getByText("🐶")).toBeVisible();
  await expect(page.getByLabel("Edit sounds")).toHaveCount(0);
  await expect(page.getByLabel("Add sound")).toHaveCount(0);
});
