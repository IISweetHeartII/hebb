// hebbian — Core Type Definitions

export interface Neuron {
  name: string;
  path: string;
  fullPath: string;
  counter: number;
  contra: number;
  dopamine: number;
  intensity: number;
  polarity: number;
  hasBomb: boolean;
  hasMemory: boolean;
  isDormant: boolean;
  depth: number;
  modTime: Date;
}

export interface Region {
  name: string;
  priority: number;
  path: string;
  neurons: Neuron[];
  axons: string[];
  hasBomb: boolean;
}

export interface Brain {
  root: string;
  regions: Region[];
  skills?: Neuron[];
}

export interface SubsumptionResult {
  activeRegions: Region[];
  blockedRegions: Region[];
  bombSource: string;
  firedNeurons: number;
  totalNeurons: number;
  totalCounter: number;
}
