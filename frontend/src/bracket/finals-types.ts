export interface FinalsHeat {
	raceId: string;
	raceOrder: number;
	heatNumber: number; // 1-7
	isCompleted: boolean;
	isActive: boolean;
	results: FinalsHeatResult[];
}

export interface FinalsHeatResult {
	pilotId: string;
	pilotName: string;
	position: number;
	points: number;
}

export interface FinalsParticipant {
	pilotId: string;
	pilotName: string;
	wins: number;
	totalPoints: number;
	heatResults: FinalsHeatResult[];
	isChampion: boolean;
	finalPosition: number | null;
}

export interface FinalsState {
	enabled: boolean;
	finalists: FinalsFinalist[];
	heats: FinalsHeat[];
	participants: FinalsParticipant[];
	championId: string | null;
	isComplete: boolean;
	requiresMoreHeats: boolean;
	message: string | null;
}

export interface FinalsFinalist {
	pilotId: string;
	pilotName: string;
	sourceRace: 'winners' | 'redemption'; // From Race 28 or 29
	sourcePosition: number;
}
