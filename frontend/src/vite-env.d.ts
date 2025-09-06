/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_USE_PB?: string;
	readonly VITE_USE_PB_RACE?: string;
	readonly VITE_API_URL?: string;
	readonly VITE_EVENT_ID?: string;
	readonly DEV?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
