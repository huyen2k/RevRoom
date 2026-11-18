import fs from 'node:fs';
import path from 'node:path';
import { generateSeasonHotelHistoryCsv, HOTEL_SEASONS } from '../src/services/historicalDataService';

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

for (const season of HOTEL_SEASONS) {
  const csvContent = generateSeasonHotelHistoryCsv(season.key);
  const filePath = path.join(docsDir, season.filename);
  fs.writeFileSync(filePath, csvContent, 'utf-8');
  const lines = csvContent.split('\n').length - 1;
  console.log(`Generated: ${season.filename} (${lines} bookings)`);
}

// Copy Q3 as the default sample_hotel_booking_history_90d.csv
const defaultCsv = generateSeasonHotelHistoryCsv('q3_peak');
fs.writeFileSync(path.join(docsDir, 'sample_hotel_booking_history_90d.csv'), defaultCsv, 'utf-8');
console.log('Updated: sample_hotel_booking_history_90d.csv (Default Q3 Peak Season)');
