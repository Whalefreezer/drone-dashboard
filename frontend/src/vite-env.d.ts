/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_USE_PB?: string;
	readonly VITE_USE_PB_RACE?: string;
	readonly VITE_API_URL?: string;
	readonly VITE_EVENT_ID?: string;
	readonly VITE_ROUTER_DEVTOOLS?: string;
	readonly DEV: boolean;
	readonly PROD: boolean;
	readonly MODE: string;
	readonly BASE_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
