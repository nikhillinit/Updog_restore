
export type Money = number;
export interface CapitalCall{date:string;amount:Money;}
export interface Distribution{date:string;amount:Money;}
export interface NavPoint{date:string;value:Money;}
export interface Investment{ id:string; companyName:string; initialAmount:Money; followOns?:Money[]; realized?:Money[]; nav?:Money; cashflows?:number[]; }
export interface FundRawData{ fundId:string; asOf?:string; committed:Money; capitalCalls:CapitalCall[]; distributions:Distribution[]; navSeries:NavPoint[]; investments:Investment[]; }
export interface FundKpis{ committed:Money; called:Money; uncalled:Money; invested:Money; nav:Money; dpi:number; tvpi:number; irr:number|null; asOf:string; }
