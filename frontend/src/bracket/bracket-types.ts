export interface BracketPilot {
	seed: string;
	name: string;
	rounds: (number | null)[];
	points: number;
}

export interface Bracket {
	name: string;
	pilots: BracketPilot[];
}

export interface EliminatedPilot {
	name: string;
	bracket: string;
	position: number;
	points: number;
}
