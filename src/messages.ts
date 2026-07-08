// Shared user-facing copy.

export const DASHBOARD_KEYS_URL = "https://app.postzen.dev/api-keys";

export const MISSING_KEY_MESSAGE =
	"No PostZen API key found. Run `postzen auth:set --key pzn_live_...` to save one, " +
	"or set the POSTZEN_API_KEY environment variable. " +
	`Create an API key on the API Keys page (${DASHBOARD_KEYS_URL}).`;

export const INVALID_KEY_MESSAGE =
	"That API key was rejected by the PostZen API (401 Unauthorized). Check it, or create a new one " +
	`on the API Keys page (${DASHBOARD_KEYS_URL}).`;
