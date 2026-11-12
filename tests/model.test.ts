import {test} from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT,POLICIES,SEGMENTS,validate} from '../src/model/types';
import {generateCustomers,weights,poisson,normalCount} from '../src/model/demand';
import {emsrB,poissonQuantile,normalQuantile} from '../src/model/emsr';
import {run,initial,step,dailyPrices} from '../src/model/simulation';
import {metrics,evaluate,csv,stats} from '../src/model/metrics';

test('Seed tái lập; chạy theo ngày bằng chạy toàn kỳ, cả hai phân phối',()=>{for(const distribution of ['poisson','normal'] as const){const c={...DEFAULT,distribution},customers=generateCustomers(c);assert.deepEqual(customers,generateCustomers(c));let s=initial();for(let i=0;i<30;i++)s=step(c,s,customers);assert.deepEqual(s,run(c));assert.equal(step(c,s,customers),s);}});
test('Seed khác tạo kịch bản khách khác; seed gốc tái lập được',()=>{const a=generateCustomers({...DEFAULT,seed:42}),b=generateCustomers({...DEFAULT,seed:43});assert.notDeepEqual(a,b);assert.deepEqual(a,generateCustomers({...DEFAULT,seed:42}));assert.deepEqual(validate({...DEFAULT,seed:4294967095}),[]);assert.ok(validate({...DEFAULT,seed:-1}).length);assert.ok(validate({...DEFAULT,seed:1.5}).length);});
test('Ba phân khúc có đường cầu sớm, giữa kỳ, muộn',()=>{for(const i of [0,1,2] as const)assert.ok(Math.abs(weights(i).reduce((a,b)=>a+b,0)-1)<1e-12);const list=generateCustomers(DEFAULT).flat();assert.ok(list.every(c=>SEGMENTS.includes(c.segment)));for(const s of SEGMENTS)assert.ok(list.some(c=>c.segment===s));});
test('Đối soát giao dịch, sức chứa và doanh thu trên cả hai phân phối',()=>{for(const distribution of ['poisson','normal'] as const)for(let seed=1;seed<=8;seed++){const c={...DEFAULT,seed,distribution},customers=generateCustomers(c),s=run(c,customers);for(const p of POLICIES){let revenue=0;for(const d of s.histories[p]){assert.ok(d.sold<=100);assert.equal(d.sold+d.remaining,100);assert.equal(d.potential,d.accepted+d.price+d.full+d.protected);assert.equal(d.potential,customers[d.day-1].length);assert.equal(d.dailyRevenue,d.transactions.filter(t=>t.outcome==='accepted').reduce((a,t)=>a+t.revenue,0));assert.equal(d.tourists+d.standard+d.business,d.potential);revenue+=d.dailyRevenue;assert.equal(d.revenue,revenue);assert.ok(d.protection[0]>=d.protection[1]);assert.ok(d.protection[1]>=0&&d.protection[1]<=100);}}}});
test('Cùng khách, WTP giống nhau; ba giá chào theo phân khúc',()=>{const customers=generateCustomers(DEFAULT),s=run(DEFAULT,customers);for(let d=0;d<30;d++)for(let i=0;i<customers[d].length;i++){const ts=POLICIES.map(p=>s.histories[p][d].transactions[i]);assert.ok(ts.every(t=>t.id===customers[d][i].id&&t.wtp===customers[d][i].wtp));}});
test('EMSR-b tạo hai ngưỡng bảo vệ lồng nhau',()=>{const y=emsrB(DEFAULT.prices,[10,20,30],100,'poisson');assert.ok(y[0]>=y[1]);assert.equal(y[2],0);assert.ok(y.every(v=>v>=0&&v<=100));assert.equal(poissonQuantile(1,.5,100),1);assert.equal(poissonQuantile(1,.9,100),2);assert.ok(normalQuantile(30,.9,100)>normalQuantile(30,.5,100));});
test('Dynamic pricing chỉ thay đổi theo ngày và giới hạn hệ số',()=>{assert.deepEqual(dailyPrices(DEFAULT,'B',5,50),DEFAULT.prices);assert.deepEqual(dailyPrices(DEFAULT,'C',1,0),DEFAULT.prices);assert.ok(dailyPrices(DEFAULT,'C',1,100)[0]>DEFAULT.prices[0]);});
test('Validation, metrics, CSV và 100 lượt đánh giá',()=>{assert.deepEqual(validate(DEFAULT),[]);assert.ok(validate({...DEFAULT,prices:[2000000,1000000,3000000]}).length);assert.ok(validate({...DEFAULT,capacity:80}).length);assert.equal(metrics(undefined,100).growth,null);assert.equal(stats([1,2,3]).sd,1);const s=run(DEFAULT),out=csv(DEFAULT,s);assert.equal(out.split('\r\n').length,91);assert.ok(out.includes('standard_arrived'));const e=evaluate(DEFAULT,100);assert.equal(e.n,100);assert.equal(e.rows.length,3);assert.equal(e.pairs.length,3);});
test('Poisson and Normal arrival samplers produce non-negative counts',()=>{const rng=()=>.5;assert.equal(poisson(0,rng),0);assert.ok(normalCount(10,rng)>=0);});


test('CustomerGenerator class tái lập lịch khách và thống kê đúng', async()=>{
 const {CustomerGenerator}=await import('../src/model/customerGenerator');
 const config={...DEFAULT,seed:2026,distribution:'poisson' as const};
 const g1=new CustomerGenerator(config),g2=new CustomerGenerator(config);
 const a=g1.generate(),b=g2.generate();
 assert.deepEqual(a,b);
 assert.equal(a.length,30);
 assert.equal(g1.allCustomers().length,a.flat().length);
 assert.equal(g1.dailySummary().length,30);
 assert.deepEqual(g1.generate(),a);
});

test('CustomerGenerator hỗ trợ Normal và WTP theo đúng phân khúc', async()=>{
 const {CustomerGenerator}=await import('../src/model/customerGenerator');
 const config={...DEFAULT,seed:2027,distribution:'normal' as const};
 const generator=new CustomerGenerator(config);
 const schedule=generator.generate();
 const customers=schedule.flat();
 assert.ok(customers.length>0);
 assert.ok(customers.every(c=>c.wtp>=config.prices[['tourist','standard','business'].indexOf(c.segment)]*.7));
 assert.ok(customers.every(c=>c.wtp<=config.prices[['tourist','standard','business'].indexOf(c.segment)]*1.6));
});
