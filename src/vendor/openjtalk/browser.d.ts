interface OpenJTalkConfig {
    dicPath?: string;
    voicePath?: string;
}
interface G2POptions {
    kana?: boolean;
}
interface ExtractFullContextOptions {
    runMecab?: boolean;
}
interface SynthesisOptions {
    sampleRate?: number;
    fperiod?: number;
    alpha?: number;
    beta?: number;
    speed?: number;
    volume?: number;
    msdThreshold?: number[];
    useLogGain?: boolean;
}
interface SynthesisResult {
    pcm: Float32Array;
    sampleRate: number;
}
interface NJDNode {
    string: string;
    pos: string;
    pos_group1: string;
    pos_group2: string;
    pos_group3: string;
    ctype: string;
    cform: string;
    orig: string;
    read: string;
    pron: string;
    acc: number;
    mora_size: number;
    chain_rule: string;
    chain_flag: number;
}

type BrowserConfigure = {
    dicUrl?: string;
    dicArchiveUrl?: string;
    voiceUrl: string;
};

declare function configure(config: BrowserConfigure): Promise<void>;
declare function g2p(text: string, options?: G2POptions): never;
declare function g2pAsync(text: string, options?: G2POptions): Promise<string>;
declare function extractFullContext(text: string, options?: ExtractFullContextOptions): never;
declare function extractFullContextAsync(text: string, options?: ExtractFullContextOptions): Promise<string[]>;
declare function synthesize(text: string, options?: SynthesisOptions): never;
declare function synthesizeAsync(text: string, options?: SynthesisOptions): Promise<SynthesisResult>;
declare function runFrontend(text: string): never;
declare function runFrontendAsync(text: string): Promise<NJDNode[]>;

export { type BrowserConfigure, type ExtractFullContextOptions, type G2POptions, type NJDNode, type OpenJTalkConfig, type SynthesisOptions, type SynthesisResult, configure, extractFullContext, extractFullContextAsync, g2p, g2pAsync, runFrontend, runFrontendAsync, synthesize, synthesizeAsync };
