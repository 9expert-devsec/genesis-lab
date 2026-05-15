/**
 * One-time seed: populate nearby_places collection with the 26 venues
 * around 9Expert Training in ราชเทวี.
 *
 * Run with Node 20+ native env-file loader:
 *   node --env-file=.env.local src/scripts/seed-nearby-places.mjs
 *
 * Idempotent: skips if the collection already has documents.
 * Image URLs point at 9experttraining.com CDN — admin can replace
 * via the admin panel later (uploads go to Cloudinary).
 *
 * Schema is inlined so the script doesn't depend on Next.js path
 * aliases (`node` alone doesn't resolve `@/...`).
 */

import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB_NAME } = process.env;

if (!MONGODB_URI) {
  console.error(
    'MONGODB_URI is not set.\n' +
    'Run with:  node --env-file=.env.local src/scripts/seed-nearby-places.mjs'
  );
  process.exit(1);
}

const NearbyPlaceSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    type:     { type: String, required: true },
    label:    { type: String, trim: true, default: '' },
    distance: { type: Number, required: true },
    walk:     { type: Number, required: true },
    detail:   { type: String, trim: true, default: '' },
    hours:    { type: String, trim: true, default: '-' },
    phone:    { type: String, trim: true, default: '-' },
    maps:     { type: String, trim: true, default: '' },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'nearby_places' }
);

const places = [
  // ── Hotels (9 entries) ──────────────────────────────────
  { name:'โรงแรมเอเวอร์กรีน เพลส', type:'hotel', label:'โรงแรม', distance:56, walk:1, detail:'โรงแรมที่พัก', hours:'-', phone:'0-2219-1111', maps:'https://maps.app.goo.gl/EGK19sCZGhKmJUL86', image_url:'https://www.9experttraining.com/images/web2024/evergreen.jpg', display_order:0 },
  { name:'โรงแรมเอเซีย', type:'hotel', label:'โรงแรม', distance:92, walk:1, detail:'โรงแรมที่พัก', hours:'-', phone:'02-217-0808 ต่อ 5253', maps:'https://www.google.co.th/maps/place/Asia+Hotel+Bangkok/@13.7513873,100.5289554,17z', image_url:'https://www.9experttraining.com/images/web2024/asiahotel.jpg', display_order:1 },
  { name:'สำนักกลางนักเรียนคริสเตียน', type:'hotel', label:'โรงแรม', distance:120, walk:1, detail:'โรงแรมที่พัก', hours:'-', phone:'02-2150628-9', maps:'https://www.google.co.th/maps/place/%E0%B8%AA%E0%B8%B3%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B8%81%E0%B8%A5%E0%B8%B2%E0%B8%87%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%A3%E0%B8%B5%E0%B8%A2%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%B4%E0%B8%AA%E0%B9%80%E0%B8%95%E0%B8%B5%E0%B8%A2%E0%B8%99/@13.7502743,100.5287043,17z', image_url:'https://www.9experttraining.com/images/web2024/scc.jpg', display_order:2 },
  { name:'โรงแรมสยามสวาน่า', type:'hotel', label:'โรงแรม', distance:230, walk:3, detail:'โรงแรมที่พัก', hours:'-', phone:'02-6110191', maps:'https://www.google.co.th/maps/place/Siam+Swana/@13.7518546,100.5278847,17z', image_url:'https://www.9experttraining.com/images/web2024/siamswana.jpg', display_order:3 },
  { name:'VIE Hotel Bangkok', type:'hotel', label:'โรงแรม', distance:350, walk:4, detail:'โรงแรมที่พัก', hours:'-', phone:'0-2309-3939', maps:'https://www.google.co.th/maps/place/VIE+Hotel+Bangkok,+MGallery+by+Sofitel/@13.7506309,100.5293221,17z', image_url:'https://www.9experttraining.com/images/web2024/vie.jpg', display_order:4 },
  { name:'อาคารเมืองพล', type:'hotel', label:'โรงแรม', distance:700, walk:9, detail:'โรงแรมที่พัก', hours:'-', phone:'0-2219-4445', maps:'https://www.google.co.th/maps/place/Muangphol+Mansion/@13.7489776,100.5285713,17z', image_url:'https://www.9experttraining.com/images/web2024/muangphol.jpg', display_order:5 },
  { name:'โรงแรมสำราญเพลส', type:'hotel', label:'โรงแรม', distance:700, walk:9, detail:'โรงแรมที่พัก', hours:'-', phone:'02-611-1245-54', maps:'https://www.google.co.th/maps/place/Samran+Place/@13.7539802,100.5266623,17z', image_url:'https://www.9experttraining.com/images/web2024/samran.jpg', display_order:6 },
  { name:'Hotel ibis Bangkok Siam', type:'hotel', label:'โรงแรม', distance:700, walk:9, detail:'โรงแรมที่พัก', hours:'-', phone:'0-2219-1111', maps:'https://www.google.co.th/maps/place/Hotel+ibis+Bangkok+Siam/@13.7465898,100.5275638,18z', image_url:'https://www.9experttraining.com/images/web2024/ibis.png', display_order:7 },
  { name:'Holiday Inn Express Bangkok Siam', type:'hotel', label:'โรงแรม', distance:850, walk:10, detail:'โรงแรมที่พัก', hours:'-', phone:'02-217-7555', maps:'https://www.google.co.th/maps/place/Holiday+Inn+Express+Bangkok+Siam/@13.7465898,100.5275638,18z', image_url:'https://www.9experttraining.com/images/web2024/holidayinbangkoksiam.jpg', display_order:8 },

  // ── Restaurants (11 entries) ────────────────────────────
  { name:'Kaizen Sushi Hibachi', type:'food', label:'ร้านอาหาร', distance:83, walk:1, detail:'ซูชิ, อาหารญี่ปุ่น', hours:'ทุกวัน 11:00 - 22:00 น.', phone:'096-886-7082', maps:'https://maps.app.goo.gl/AVA5dCFiJRDJ17Mr7', image_url:'https://www.9experttraining.com/images/web2024/kaizen.jpg', display_order:9 },
  { name:'Fishmonger Asia Hotel', type:'food', label:'ร้านอาหาร', distance:170, walk:3, detail:'Fish & Chips', hours:'12:00 - 22:00 น.', phone:'092-337-1115', maps:'https://maps.app.goo.gl/zFvbgaX49NpYZrHy7', image_url:'https://www.9experttraining.com/images/web2024/fishmonger.jpg', display_order:10 },
  { name:'Feat Lab', type:'food', label:'ร้านอาหาร', distance:190, walk:3, detail:'ร้านอาหารอเมริกัน', hours:'จันทร์-เสาร์ 12:00 - 22:00 น.', phone:'02-611-0070', maps:'https://www.google.co.th/maps/place/FEAT+LAB/@13.749835,100.5288383,17z', image_url:'https://www.9experttraining.com/images/web2024/featlab.jpg', display_order:11 },
  { name:'Green & Sunny', type:'food', label:'ร้านอาหาร', distance:200, walk:3, detail:'อาหาร Vegan 100%', hours:'ทุกวัน 08:00 - 19:00 น.', phone:'063-249-8992', maps:'https://maps.app.goo.gl/687GKZqpoykEzgVp9', image_url:'https://www.9experttraining.com/images/web2024/greensunny.jpg', display_order:12 },
  { name:'ร้านข้าวแกงปักษ์ใต้', type:'food', label:'ร้านอาหาร', distance:230, walk:3, detail:'อาหารใต้, อาหารตามสั่ง, อาหารไทย', hours:'ทุกวัน 06:00 - 15:30 น.', phone:'-', maps:'https://maps.app.goo.gl/wHDxB8pMAFoV7tGs7', image_url:'https://www.9experttraining.com/images/web2024/soutfood.jpg', display_order:13 },
  { name:'ร้านอาหารไทย เพื่อนรัก', type:'food', label:'ร้านอาหาร', distance:240, walk:3, detail:'อาหารไทย', hours:'ทุกวัน 08:00 - 21:00 น.', phone:'02-611-0402', maps:'https://maps.app.goo.gl/C3BWJ8fQUDZpPNeA8', image_url:'https://www.9experttraining.com/images/web2024/friends.jpg', display_order:14 },
  { name:'Sushi Masa', type:'food', label:'ร้านอาหาร', distance:270, walk:4, detail:'ร้านซูชิ', hours:'ทุกวัน 10:30 - 20:00 น.', phone:'02-215-9289', maps:'https://maps.app.goo.gl/weH16ju8SRTHxTZz7', image_url:'https://www.9experttraining.com/images/web2024/sushimasa.jpg', display_order:15 },
  { name:'บ้านลองลิ้ม | Baan Progressive Thai Cuisine', type:'food', label:'ร้านอาหาร', distance:300, walk:4, detail:'ร้านอาหารไทย สไตล์ประยุกต์', hours:'ทุกวัน 11:00 - 22:00 น.', phone:'063-109-9909', maps:'https://maps.app.goo.gl/ZHGNsNeuAYkk6F6K7', image_url:'https://www.9experttraining.com/images/web2024/longlimb.jpg', display_order:16 },
  { name:'อีชา อาหารเกาหลี สาขาราชเทวี', type:'food', label:'ร้านอาหาร', distance:350, walk:6, detail:'อาหารเกาหลี, อาหารจานเดียว, ปิ้งย่าง', hours:'ทุกวัน 15:00 - 00:00 น.', phone:'085-256-7868', maps:'https://maps.app.goo.gl/Lb27f1vcwSNicDD47', image_url:'https://www.9experttraining.com/images/web2024/echa.jpg', display_order:17 },
  { name:'ร้าน Hungry Nerd', type:'food', label:'ร้านอาหาร', distance:400, walk:6, detail:'Steak, สลัด', hours:'11:30 - 24:00 น.', phone:'0-2656-5550', maps:'https://www.google.co.th/maps/place/Hungry+Nerd/@13.751749,100.5296488,17z', image_url:'https://www.9experttraining.com/images/web2024/hungrynerd.jpg', display_order:18 },
  { name:'Shuba Shabu', type:'food', label:'ร้านอาหาร', distance:400, walk:6, detail:'ชาบูหม้อไฟ', hours:'ทุกวัน 12:00 - 22:00 น.', phone:'082-779-8789', maps:'https://www.google.co.th/maps/place/Shuba+Shabu/@13.7518805,100.5297745,17z', image_url:'https://www.9experttraining.com/images/web2024/shubashabu.jpg', display_order:19 },

  // ── Cafes (4 entries) ────────────────────────────────────
  { name:'Casa Lapin Ratchathewi', type:'cafe', label:'ร้านกาแฟ', distance:36, walk:1, detail:'กาแฟ เบเกอรี่', hours:'ทุกวัน 07:00 - 18:30 น.', phone:'064-575-7384', maps:'https://maps.app.goo.gl/eqMvbpNQK72PwPHcA', image_url:'https://www.9experttraining.com/images/web2024/casa.jpg', display_order:20 },
  { name:'Roots at Ratchathewi', type:'cafe', label:'ร้านกาแฟ', distance:87, walk:1, detail:'กาแฟ เบเกอรี่', hours:'ทุกวัน 08:00 - 19:00 น.', phone:'064-575-7384', maps:'https://maps.app.goo.gl/HJK851GCU5tjbkTQ7', image_url:'https://www.9experttraining.com/images/web2024/roots.png', display_order:21 },
  { name:'Screaming Beans', type:'cafe', label:'ร้านกาแฟ', distance:210, walk:3, detail:'กาแฟ', hours:'ทุกวัน 07:00 - 16:00 น.', phone:'095-471-1446', maps:'https://maps.app.goo.gl/fLekYDb2YRCuoEB37', image_url:'https://www.9experttraining.com/images/web2024/screaming.jpg', display_order:22 },
  { name:'Zimt.Bkk - German Bakery and Cafe', type:'cafe', label:'ร้านกาแฟ', distance:230, walk:3, detail:'กาแฟ เบเกอรี่', hours:'ทุกวัน 07:00 - 18:00 น.', phone:'090-213-9050', maps:'https://maps.app.goo.gl/RDfPYDzvbQpN26FK9', image_url:'https://www.9experttraining.com/images/web2024/zimt.jpg', display_order:23 },

  // ── Drinks (1 entry) ─────────────────────────────────────
  { name:'Sip_Code', type:'drink', label:'เครื่องดื่ม', distance:91, walk:1, detail:'บาร์น้ำปั่นและน้ำผลไม้', hours:'ทุกวัน 08:00 - 17:00 น.', phone:'084-147-7766', maps:'https://maps.app.goo.gl/W45QEHMANyQyFYX58', image_url:'https://www.9experttraining.com/images/web2024/sipcode.jpg', display_order:24 },

  // ── Bar (1 entry) ────────────────────────────────────────
  { name:'Loyshy Bar', type:'bar', label:'ผับและร้านอาหาร', distance:290, walk:4, detail:'เครื่องดื่ม อาหาร', hours:'ทุกวัน 18:00 - 01:00 น.', phone:'090-970-6439', maps:'https://www.google.co.th/maps/place/Loyshy+Bar/@13.7517122,100.5278063,17z', image_url:'https://www.9experttraining.com/images/web2024/loyshy.png', display_order:25 },
];

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  const NearbyPlace =
    mongoose.models.NearbyPlace || mongoose.model('NearbyPlace', NearbyPlaceSchema);

  const existing = await NearbyPlace.countDocuments();
  if (existing > 0) {
    console.log(`Collection already has ${existing} documents. Skipping seed.`);
    console.log('To re-seed: delete all documents from nearby_places first.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await NearbyPlace.insertMany(places);
  console.log(`Inserted ${result.length} nearby places`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});