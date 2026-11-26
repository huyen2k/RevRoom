export type Policy='A'|'B'|'C';
export type Distribution='poisson'|'normal';
export type Segment='tourist'|'standard'|'business';
export type SegmentValues = [number, number, number];
export type DemandProfile = { dailyMeans: SegmentValues[]; historyStart?: string; calendarStart?: string; calendarFactors?: SegmentValues[] };
export type Config={capacity:number;seed:number;intensity:number;prices:[number,number,number];demands:[number,number,number];k:number;min:number;max:number;distribution:Distribution;demandProfile?:DemandProfile};
export type Customer={id:number;segment:Segment;wtp:number;arrivalDay:number};
export type Outcome='accepted'|'price'|'full'|'protected';
export type Transaction=Customer&{price:number;outcome:Outcome;before:number;protection:number;revenue:number};
export type Day={day:number;potential:number;tourists:number;standard:number;business:number;price:number;full:number;protected:number;accepted:number;dailyRevenue:number;revenue:number;sold:number;remaining:number;prices:[number,number,number];protection:[number,number,number];transactions:Transaction[];priceMultiplier:number};
export type State={day:number;histories:Record<Policy,Day[]>};
export const POLICIES:Policy[]=['A','B','C'];
export const LABELS:Record<Policy,string>={A:'FCFS · Giá cố định',B:'EMSR-b · Giá cố định',C:'Dynamic Pricing + EMSR-b'};
export const SEGMENTS:Segment[]=['tourist','standard','business'];
export const SEGMENT_LABELS:Record<Segment,string>={tourist:'Khách du lịch',standard:'Khách tiêu chuẩn',business:'Thương nhân'};
export const DEFAULT:Config={capacity:100,seed:42,intensity:1,prices:[700000,1100000,1600000],demands:[100,70,40],k:.6,min:.8,max:1.25,distribution:'poisson'};
export function validate(c:Config):string[]{const e:string[]=[];if(!Number.isInteger(c.capacity)||c.capacity!==100)e.push('Mô hình sử dụng cố định 100 phòng để hiển thị lưới tồn kho.');if(!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967095)e.push('Seed phải là số nguyên hợp lệ.');if(c.prices.length!==3||c.prices.some(p=>!Number.isFinite(p)||p<10000||p>100000000)||!(c.prices[0]<c.prices[1]&&c.prices[1]<c.prices[2]))e.push('Giá phải tăng dần: du lịch < tiêu chuẩn < thương nhân; mỗi giá từ 10.000 đến 100.000.000đ.');if(c.demands.length!==3||c.demands.some(d=>!Number.isFinite(d)||d<0||d>2000))e.push('Nhu cầu mỗi phân khúc phải từ 0 đến 2.000 khách.');if(![.5,1,1.5].includes(c.intensity))e.push('Cường độ nhu cầu không hợp lệ.');if(!['poisson','normal'].includes(c.distribution))e.push('Phân phối nhu cầu không hợp lệ.');if(!Number.isFinite(c.k)||c.k<0||c.k>3||!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min<.1||c.min>1||c.max<1||c.max>3)e.push('Tham số giá động không hợp lệ.');if(c.demandProfile && (!Array.isArray(c.demandProfile.dailyMeans) || c.demandProfile.dailyMeans.length !== 30 ||
    c.demandProfile.dailyMeans.some(day => !Array.isArray(day) || day.length !== 3 || day.some(mean => !Number.isFinite(mean) || mean < 0 || mean > 100000)))) {
  e.push('Hồ sơ nhu cầu phải gồm 30 ngày với kỳ vọng hợp lệ cho ba phân khúc.');
}return e;}
