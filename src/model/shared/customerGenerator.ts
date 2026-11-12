import type { Config, Customer, Segment } from '../types';

/**
 * Customer Data Generator cho revRoom.
 *
 * Tạo một lịch khách hàng 30 ngày với ba phân khúc:
 * tourist (đặt sớm), standard (đặt giữa kỳ), business (đặt muộn).
 *
 * Kết quả generateCustomers() phải được dùng chung cho A/B/C để bảo đảm
 * các chiến lược được so sánh trên cùng khách hàng, WTP và thứ tự đến.
 */

export type SegmentIndex = 0 | 1 | 2;
export type CustomerSchedule = Customer[][];

/**
 * PRNG Mulberry32. Cùng seed tạo cùng chuỗi số giả ngẫu nhiên.
 * Giữ thuật toán hiện tại của revRoom để không làm thay đổi khả năng
 * tái lập kết quả của các seed đã có.
 */
export function random(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sinh một biến ngẫu nhiên Poisson(lambda) bằng thuật toán Knuth.
 *
 * Với lambda lớn, tách lambda thành các phần <= 20.
 * Tổng các biến Poisson độc lập có phân phối Poisson với tham số
 * bằng tổng các lambda thành phần.
 */
export function poisson(lambda: number, rng: () => number): number {
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new RangeError('lambda phải là số hữu hạn và không âm.');
  }

  let result = 0;
  let remaining = lambda;

  while (remaining > 0) {
    const chunk = Math.min(20, remaining);
    const limit = Math.exp(-chunk);
    let product = 1;
    let count = 0;

    do {
      count += 1;
      product *= Math.max(rng(), Number.MIN_VALUE);
    } while (product > limit);

    result += count - 1;
    remaining -= chunk;
  }

  return result;
}

/**
 * Sinh số khách theo xấp xỉ Normal.
 *
 * revRoom hiện dùng sigma = sqrt(mu), tương ứng xấp xỉ Gaussian có
 * phương sai bằng kỳ vọng Poisson. Kết quả được làm tròn và cắt tại 0.
 */
export function normalCount(mu: number, rng: () => number): number {
  if (!Number.isFinite(mu) || mu < 0) {
    throw new RangeError('mu phải là số hữu hạn và không âm.');
  }
  if (mu === 0) return 0;

  const u = Math.max(rng(), 1e-12);
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);

  return Math.max(0, Math.round(mu + Math.sqrt(mu) * z));
}

/**
 * Trọng số booking curve cho từng phân khúc.
 *
 * 0 - Tourist: booking sớm, trọng số giảm dần.
 * 1 - Standard: booking giữa kỳ, trọng số dạng tam giác.
 * 2 - Business: booking muộn, trọng số tăng dần.
 *
 * revRoom hiện mô phỏng cố định 30 ngày, do đó hàm này dùng 30 ngày.
 */
export function weights(segment: SegmentIndex): number[] {
  const raw = Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;

    if (segment === 0) return 30 - index;
    if (segment === 1) return 16 - Math.abs(day - 15.5);
    return day;
  });

  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map(value => value / total);
}

/**
 * Xác suất mua theo giả định WTP ~ Uniform(0.7p0, 1.6p0).
 * Hàm này dùng trong dự báo nhu cầu còn lại của EMSR-b.
 */
export function buyProbability(price: number, reference: number): number {
  return Math.max(0, Math.min(1, (1.6 - price / reference) / 0.9));
}

/**
 * Tạo một khách hàng theo cấu trúc Customer đang dùng trong types.ts.
 */
function createCustomer(
  id: number,
  segment: Segment,
  referencePrice: number,
  arrivalDay: number,
  rng: () => number,
): Customer {
  return {
    id,
    segment,
    wtp: referencePrice * (0.7 + 0.9 * rng()),
    arrivalDay,
  };
}

/**
 * Class bao đóng trạng thái PRNG và bộ đếm ID.
 *
 * Mỗi lần generate() sẽ reset PRNG về config.seed và reset ID về 0,
 * vì vậy gọi nhiều lần trên cùng instance vẫn tái tạo cùng kịch bản.
 */
export class CustomerGenerator {
  private rng: () => number;
  private nextId = 0;
  private schedule: CustomerSchedule = [];

  constructor(private readonly config: Config) {
    this.rng = random(config.seed);
  }

  private reset(): void {
    this.rng = random(this.config.seed);
    this.nextId = 0;
    this.schedule = [];
  }

  private generateDay(dayIndex: number, bookingWeights: number[][]): Customer[] {
    const customers: Customer[] = [];
    const segments: Segment[] = ['tourist', 'standard', 'business'];

    for (let segmentIndex = 0; segmentIndex < 3; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const mean =
        this.config.demands[segmentIndex] *
        this.config.intensity *
        bookingWeights[segmentIndex][dayIndex];

      const count =
        this.config.distribution === 'poisson'
          ? poisson(mean, this.rng)
          : normalCount(mean, this.rng);

      for (let index = 0; index < count; index += 1) {
        this.nextId += 1;
        customers.push(
          createCustomer(
            this.nextId,
            segment,
            this.config.prices[segmentIndex],
            dayIndex + 1,
            this.rng,
          ),
        );
      }
    }

    // Fisher-Yates shuffle: mô phỏng thứ tự khách đến trong ngày.
    for (let index = customers.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.rng() * (index + 1));
      [customers[index], customers[swapIndex]] = [
        customers[swapIndex],
        customers[index],
      ];
    }

    return customers;
  }

  /**
   * Sinh toàn bộ lịch khách 30 ngày.
   * Trả về Customer[][] tương thích trực tiếp với Simulation Engine.
   */
  generate(): CustomerSchedule {
    this.reset();

    const bookingWeights: number[][] = [
      weights(0),
      weights(1),
      weights(2),
    ];

    this.schedule = Array.from({ length: 30 }, (_, dayIndex) =>
      this.generateDay(dayIndex, bookingWeights),
    );

    return this.schedule;
  }

  /** Lấy lịch khách đã sinh. */
  getSchedule(): CustomerSchedule {
    return this.schedule;
  }

  /** Trả về danh sách khách dạng phẳng. */
  allCustomers(): Customer[] {
    return this.schedule.flat();
  }

  /** Thống kê số khách theo ngày và phân khúc. */
  dailySummary(): Array<{
    day: number;
    tourist: number;
    standard: number;
    business: number;
    total: number;
  }> {
    return this.schedule.map((customers, index) => {
      const tourist = customers.filter(customer => customer.segment === 'tourist').length;
      const standard = customers.filter(customer => customer.segment === 'standard').length;
      const business = customers.filter(customer => customer.segment === 'business').length;

      return {
        day: index + 1,
        tourist,
        standard,
        business,
        total: customers.length,
      };
    });
  }
}

/**
 * API tương thích ngược với revRoom hiện tại.
 *
 * App.tsx và simulation.ts đang import generateCustomers(config)
 * từ demand.ts. demand.ts sẽ re-export hàm này để không phải sửa
 * các module đang sử dụng.
 */
export function generateCustomers(config: Config): CustomerSchedule {
  return new CustomerGenerator(config).generate();
}
