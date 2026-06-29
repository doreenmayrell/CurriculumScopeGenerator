# Export to Google Doc

The Scope Result screen's **Create Scoping Document** button signs you into Google and
creates a doc in the configured Drive folder with a **Proposed Scope** tab and one
additional Google Docs tab per proposed lesson. Each lesson tab contains a table
with the lesson's full spec.

## One-time setup (Google Cloud)

You need a Google OAuth **client id**. It's free.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library →** enable **both** the **Google Docs API** and the **Google Drive API**
   (Drive is needed to place the doc in a folder).
3. **APIs & Services → OAuth consent screen:** choose **External**, fill the basics, and
   under **Test users** add the Google account you'll export with (while the app is in
   "Testing", only listed test users can authorize).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**
   - **Authorized JavaScript origins:** add both local dev origins:
     `http://localhost:5173` and `http://127.0.0.1:5173`
     (add your production origin too when you deploy).
   - **Authorized redirect URIs:** add both local return URLs:
     `http://localhost:5173/` and `http://127.0.0.1:5173/`
   - Create, then copy the **Client ID** (looks like `1234567890-abc...apps.googleusercontent.com`).

The app requests `https://www.googleapis.com/auth/documents` and
`https://www.googleapis.com/auth/drive`. Docs is used to create the document tabs and
fill each tab. Drive is used to read the target folder for V2/V3 naming and move the
created doc into the configured folder.

## Always save into the scoping folder

Every export lands in this folder by default:

`https://drive.google.com/drive/folders/1NSZfxPSnE-y9Oab_K9XMX2QQVMGKk1l7`

If the folder already contains `TEKS Kindergarten`, the next export is named
`TEKS Kindergarten V2`, then `TEKS Kindergarten V3`, and so on.

For team use, this folder should be in a **Shared Drive** and every signer should be a member
with permission to add files.

1. Create the folder inside a **Shared Drive** and add the people who will export as **members** of
   that Shared Drive (Content manager or above, so they can add files).
2. Open the folder and copy its ID from the URL:
   `https://drive.google.com/drive/folders/`**`<THIS_PART>`**.
3. Put it in `.env` as `VITE_GOOGLE_DRIVE_FOLDER_ID` (below) only if you want to override
   the default folder.

Every signed-in member's export is then created in that folder and visible to the whole drive.

## Configure the app

1. Copy `.env.example` to `.env`.
2. Set the values:

   ```
   VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
   VITE_GOOGLE_DRIVE_FOLDER_ID=1NSZfxPSnE-y9Oab_K9XMX2QQVMGKk1l7
   ```

3. Restart `npm run dev` (Vite only reads env vars at startup).

The exported doc is always named **`<Standard Set> <Ordinal Grade>`** — e.g. `TEKS 5th Grade`,
`TEKS Kindergarten` — from the name you enter on the Run Scope screen plus the workspace grade.

If `VITE_GOOGLE_CLIENT_ID` is unset, the button explains what to configure instead of
failing silently.

## Using it

Run a scope analysis, then on the result screen click **Create Scoping Document**. A Google
sign-in popup appears the first time; after you grant access, the doc is created in the
configured Drive folder and opens in a new tab. The doc title is `"<System name> <Grade>"`
(e.g. `TEKS Kindergarten`), with V2/V3 added when needed.

## Notes / limits

- Implemented in [`src/lib/googleDocsExport.js`](../src/lib/googleDocsExport.js) with
  Google Identity Services (token flow) + Google Docs tab requests - no backend required.
- A pop-up/3rd-party-cookie blocker can stop the Google sign-in popup; allow it for this site.
- The first tab is renamed **Proposed Scope**; every proposed lesson becomes its own tab.
