// Harus di-import paling awal. Modul lain membaca process.env saat di-load,
// jadi .env wajib sudah termuat sebelum itu.
import { config } from "dotenv";

config({ quiet: true });
