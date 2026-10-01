// Voxly extension config — edit these for your deployment, then reload the
// extension at chrome://extensions. No code changes needed.
//
// This file is loaded by background.js via importScripts, so it must use a
// plain global (no import/export).
var VOXLY_CONFIG = {
  // Base URL of the Voxly web app + API (must match `host_permissions` in
  // manifest.json, otherwise the extension cannot read the login cookie).
  // Local development: 'http://localhost:3000'
  // Vercel deployment: 'https://your-project-name.vercel.app'
  apiBase: 'http://localhost:3000',

  // Supabase project used for login (Google OAuth) from the extension.
  // Find these in the Supabase dashboard: Project Settings -> API.
  supabaseUrl: 'https://your-project-ref.supabase.co',
  supabaseAnonKey: 'your-anon-key',
};
