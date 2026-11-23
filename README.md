# CodeVault: a VS Code style file storage app

A web app that looks and works like VS Code (activity bar, Explorer tree, tabs,
Monaco editor, status bar, command palette). Every folder and file you create or
upload is stored in **Supabase**. The app sets **no size limit** on a file: an
`index.html` with 50 lines or a log file with 5 million lines is saved the same way.

Built with **React + HTML + CSS** (Vite) and ready to deploy on **Vercel**.

---

## How data is stored

| What | Where |
| --- | --- |
| Folder / file tree (name, parent, size, type) | Postgres table `public.nodes` |
| File contents (the actual code / bytes) | Supabase Storage bucket `user-files`, at `<user_id>/<file_id>` |

* Files up to 6 MB are uploaded in a single request.
* Files over 6 MB use **resumable chunked uploads (TUS)**, which is the Supabase
  method for big files (up to 500 GB per file on paid plans). An interrupted
  upload of a file from disk resumes where it stopped.
* Row Level Security means each signed-in user can only see and change **their own** files.

> The only size limit is the one set in your Supabase project: **Project Settings →
> Storage → Upload file size limit**. On the Free plan the maximum is 50 MB per file;
> on Pro and above you can raise it as high as 500 GB.

---

## Features

* VS Code Dark+ look: title bar with menus, activity bar, resizable side bar, tabs, breadcrumbs, status bar
* Explorer: new file / folder (type `src/app/index.js` to create nested folders), rename (F2),
  delete, drag & drop to move, right-click context menus, keyboard navigation
* Upload files **or whole folders**: with the buttons, or by dragging them from your computer onto the Explorer
* Monaco editor (the editor VS Code uses) with syntax highlighting for 40+ languages
* `Ctrl+S` saves to Supabase; optional **Auto Save**; unsaved-changes dots and prompts
* Image / video / audio / PDF preview; binary files can be downloaded
* Quick Open (`Ctrl+P`), Command Palette (`Ctrl+Shift+P` / `F1`), file-name search
* Download any file; storage usage shown in the Explorer and on the Welcome page
* Email + password sign-in (Supabase Auth)

---

## 1. Set up Supabase

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   This creates the `nodes` table, its security rules, and the private `user-files` storage bucket.
3. **Authentication → URL Configuration**
   * *Site URL*: your Vercel URL, e.g. `https://your-app.vercel.app`
   * *Redirect URLs*: add `http://localhost:5173` for local development
4. Optional, for quick testing: **Authentication → Sign In / Providers → Email**. Turn off
   *Confirm email* so new accounts can sign in right away.
5. Optional: raise **Project Settings → Storage → Upload file size limit** if you need files larger than 50 MB.
6. Copy the **Project URL** and the **anon** (or **publishable**) key from **Project Settings → API**.

## 2. Run locally

```bash
npm install
cp .env.example .env.local    # then fill in the two values
npm run dev                   # http://localhost:5173
```

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, click **Add New → Project** and import the repository (Vercel detects *Vite* automatically:
   build command `npm run build`, output directory `dist`).
3. Under **Environment Variables**, add:
   * `VITE_SUPABASE_URL`
   * `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. If you add or change the variables later, **redeploy**, because Vite builds them into the app at build time.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+P` | Go to file |
| `Ctrl+Shift+P` / `F1` | Command palette |
| `Ctrl+S` | Save |
| `Ctrl+B` | Toggle side bar |
| `Ctrl+Shift+E` / `Ctrl+Shift+F` | Explorer / Search |
| `Alt+Z` | Toggle word wrap |
| `F2` / `Delete` | Rename / delete the selected item in the Explorer |

On macOS use `⌘` instead of `Ctrl`.

## Project structure

```
supabase/schema.sql        database table, security policies, storage bucket
src/lib/storage.js         all Supabase reads/writes (tree + file contents, resumable uploads)
src/lib/tree.js            tree helpers (paths, children, ancestors)
src/lib/fileTypes.js       languages, icons, media/binary detection
src/components/Workbench   main layout and file operations
src/components/Explorer    file tree (create, rename, drag & drop, upload)
src/components/EditorArea  tabs, breadcrumbs, Monaco editor, previews
src/styles/                VS Code-like styling
```
