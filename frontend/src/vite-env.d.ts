/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_API_URL?: string; readonly VITE_SOCKET_URL?: string; readonly VITE_APP_NAME?: string; readonly VITE_CONTACT_EMAIL?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
