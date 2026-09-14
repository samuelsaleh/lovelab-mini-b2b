/**
 * Read a fetch Response as JSON without dying on a non-JSON body.
 *
 * 14 Sep 2026: an agent opened Save Order while the server was mid-deploy
 * (the deploy script rebuilds and restarts the live app, about a minute).
 * Apache answered with a text page and the dialog showed
 * "Failed to execute 'json' on 'Response': Unexpected token 'T', "The
 * deploy"… is not valid JSON". The order was still on screen; nothing said so.
 *
 * Returns the parsed object, or `{ error, serverSaid, notJson: true }` with a
 * message a person can act on.
 */
export const UPDATING_MESSAGE =
  'The app is being updated right now. Wait a minute and try again — your order is still on this screen.';

export async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const serverSaid = text.slice(0, 140).trim();
    return { error: UPDATING_MESSAGE, serverSaid, notJson: true };
  }
}
