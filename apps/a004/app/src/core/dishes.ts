/**
 * Offline regional dish database — the differentiator vs Western-centric
 * trackers. Every entry is a real dish with a carb range (grams per typical
 * serving), a glycemic band and a practical local swap. Built from curated
 * lists plus real variant families (stuffed parathas, dosas, biryanis, tacos,
 * empanadas, arepas, tagines…), deduped by slug. 600+ dishes, fully offline.
 */
import type { Cuisine, GiBand } from "./model";

export interface Dish {
  id: string; // slug
  name: string;
  aliases: string[];
  region: Cuisine;
  carbsLow: number; // g per serving
  carbsHigh: number;
  giBand: GiBand;
  swapIdeas: string;
}

type Seed = [name: string, lo: number, hi: number, gi: GiBand];

export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A sensible swap when a dish doesn't carry its own suggestion. Descriptive, wellness-only. */
function defaultSwap(region: Cuisine, gi: GiBand, name: string): string {
  if (gi === "low") return `${name} is a steadier choice — keep the portion and pair it with protein or vegetables.`;
  const base =
    region === "india"
      ? "Add dal, a bowl of vegetables or salad, and keep rice/bread to one serving"
      : region === "africa"
        ? "Serve a smaller swallow with extra greens, beans or soup"
        : region === "latam"
          ? "Add beans, salad or avocado and keep the portion to one serving"
          : "Keep the portion to one serving and add protein, vegetables or salad";
  return gi === "high"
    ? `${base} to soften the rise after this meal.`
    : `${base} to keep it gentler on your readings.`;
}

// ── India ──────────────────────────────────────────────────────────────────────
const INDIA: Seed[] = [
  // Breads & breakfast
  ["Roti", 15, 20, "medium"], ["Phulka", 12, 16, "medium"], ["Tandoori roti", 20, 28, "medium"],
  ["Rumali roti", 18, 24, "high"], ["Missi roti", 20, 26, "medium"], ["Jowar bhakri", 18, 24, "low"],
  ["Bajra roti", 18, 24, "low"], ["Ragi roti", 16, 22, "low"], ["Makki di roti", 22, 28, "medium"],
  ["Naan", 45, 55, "high"], ["Butter naan", 48, 58, "high"], ["Garlic naan", 46, 56, "high"],
  ["Kulcha", 38, 48, "high"], ["Amritsari kulcha", 42, 52, "high"], ["Bhatura", 40, 50, "high"],
  ["Puri", 25, 35, "high"], ["Luchi", 22, 30, "high"], ["Lachha paratha", 30, 40, "high"],
  ["Malabar parotta", 40, 50, "high"], ["Appam", 20, 28, "medium"], ["Neer dosa", 18, 24, "medium"],
  ["Idli", 12, 18, "medium"], ["Rava idli", 16, 22, "medium"], ["Medu vada", 18, 24, "medium"],
  ["Dhokla", 20, 28, "medium"], ["Khaman dhokla", 22, 30, "medium"], ["Thepla", 20, 26, "medium"],
  ["Khakhra", 15, 20, "medium"], ["Poha", 30, 40, "medium"], ["Upma", 28, 38, "medium"],
  ["Rava upma", 30, 40, "medium"], ["Sabudana khichdi", 40, 50, "high"], ["Uttapam", 28, 36, "medium"],
  ["Onion uttapam", 30, 38, "medium"], ["Pesarattu", 22, 30, "low"], ["Sheera", 40, 50, "high"],
  ["Aloo puri", 45, 55, "high"], ["Chole bhature", 70, 85, "high"], ["Misal pav", 45, 55, "medium"],
  // Rice
  ["Steamed rice", 40, 50, "high"], ["Jeera rice", 42, 52, "high"], ["Ghee rice", 45, 55, "high"],
  ["Brown rice", 38, 46, "medium"], ["Lemon rice", 42, 52, "high"], ["Curd rice", 38, 46, "medium"],
  ["Tamarind rice", 45, 55, "high"], ["Coconut rice", 44, 54, "high"], ["Tomato rice", 42, 52, "high"],
  ["Bisi bele bath", 48, 58, "high"], ["Khichdi", 35, 45, "medium"], ["Ven pongal", 40, 50, "medium"],
  ["Vegetable fried rice", 45, 55, "high"], ["Curd", 6, 10, "low"],
  // Dals & gravies (base — variants generated below)
  ["Sambar", 14, 22, "low"], ["Rasam", 8, 14, "low"], ["Kadhi", 14, 20, "medium"],
  ["Rajma", 30, 40, "low"], ["Chole", 32, 42, "low"], ["Kala chana", 28, 36, "low"],
  ["Lobia", 28, 36, "low"], ["Dal dhokli", 40, 50, "medium"], ["Pav bhaji", 48, 60, "high"],
  // Sabzis & mains
  ["Aloo gobi", 18, 26, "medium"], ["Bhindi masala", 10, 16, "low"], ["Baingan bharta", 12, 18, "low"],
  ["Palak paneer", 12, 18, "low"], ["Paneer butter masala", 16, 24, "medium"], ["Shahi paneer", 18, 26, "medium"],
  ["Matar paneer", 16, 24, "medium"], ["Kadai paneer", 14, 22, "low"], ["Malai kofta", 24, 34, "medium"],
  ["Mixed vegetable curry", 16, 24, "medium"], ["Aloo matar", 20, 28, "medium"], ["Dum aloo", 22, 30, "medium"],
  ["Chana masala", 32, 42, "low"], ["Vegetable korma", 18, 26, "medium"], ["Navratan korma", 24, 32, "medium"],
  ["Butter chicken", 12, 20, "low"], ["Chicken curry", 8, 14, "low"], ["Chicken tikka masala", 12, 20, "low"],
  ["Fish curry", 6, 12, "low"], ["Egg curry", 8, 14, "low"], ["Keema matar", 12, 18, "low"],
  ["Rogan josh", 8, 14, "low"], ["Chicken chettinad", 8, 14, "low"], ["Prawn curry", 8, 14, "low"],
  ["Tandoori chicken", 4, 8, "low"], ["Chicken 65", 14, 22, "medium"], ["Paneer tikka", 10, 16, "low"],
  // Street & snacks
  ["Samosa", 24, 32, "high"], ["Kachori", 26, 34, "high"], ["Aloo tikki", 22, 30, "medium"],
  ["Vada pav", 42, 52, "high"], ["Pani puri", 30, 40, "high"], ["Bhel puri", 32, 42, "high"],
  ["Sev puri", 30, 40, "high"], ["Dahi puri", 30, 40, "high"], ["Dabeli", 40, 50, "high"],
  ["Kathi roll", 35, 45, "medium"], ["Onion bhaji", 20, 28, "medium"], ["Aloo chaat", 26, 34, "medium"],
  ["Papdi chaat", 30, 40, "high"], ["Momos", 28, 36, "medium"], ["Spring roll", 24, 32, "medium"],
  ["Pakora", 18, 26, "medium"],
  // Sweets
  ["Gulab jamun", 30, 40, "high"], ["Rasgulla", 24, 32, "high"], ["Jalebi", 40, 50, "high"],
  ["Besan laddu", 28, 36, "high"], ["Motichoor laddu", 30, 38, "high"], ["Kaju katli", 22, 30, "high"],
  ["Sooji halwa", 36, 46, "high"], ["Gajar halwa", 34, 44, "high"], ["Rice kheer", 30, 40, "high"],
  ["Payasam", 32, 42, "high"], ["Rava kesari", 36, 46, "high"], ["Mysore pak", 30, 38, "high"],
  ["Soan papdi", 28, 36, "high"], ["Rasmalai", 26, 34, "high"], ["Kulfi", 24, 32, "high"],
  ["Shrikhand", 28, 36, "high"], ["Modak", 30, 38, "high"], ["Barfi", 28, 36, "high"],
];

// ── Africa ──────────────────────────────────────────────────────────────────────
const AFRICA: Seed[] = [
  ["Injera", 30, 42, "medium"], ["Teff injera", 28, 40, "low"], ["Ugali", 40, 52, "high"],
  ["Fufu", 44, 56, "high"], ["Cassava fufu", 46, 58, "high"], ["Pounded yam", 48, 60, "high"],
  ["Eba", 46, 58, "high"], ["Banku", 44, 56, "high"], ["Kenkey", 46, 58, "high"],
  ["Jollof rice", 45, 58, "high"], ["Ghana waakye", 48, 60, "high"], ["Nigerian fried rice", 46, 58, "high"],
  ["Egusi soup", 10, 18, "low"], ["Okra soup", 8, 14, "low"], ["Ogbono soup", 10, 16, "low"],
  ["Efo riro", 8, 14, "low"], ["Edikang ikong", 8, 14, "low"], ["Bitterleaf soup", 8, 14, "low"],
  ["Pepper soup", 6, 12, "low"], ["Groundnut soup", 14, 22, "low"], ["Light soup", 8, 14, "low"],
  ["Palm nut soup", 12, 20, "low"], ["Moi moi", 20, 28, "low"], ["Akara", 18, 26, "low"],
  ["Suya", 4, 10, "low"], ["Kelewele", 36, 46, "high"], ["Fried plantain", 34, 44, "high"],
  ["Boiled plantain", 32, 42, "medium"], ["Matoke", 34, 44, "medium"], ["Githeri", 32, 42, "low"],
  ["Mukimo", 34, 44, "medium"], ["Sukuma wiki", 6, 12, "low"], ["Nyama choma", 2, 6, "low"],
  ["Mandazi", 30, 40, "high"], ["Swahili chapati", 30, 40, "high"], ["Pilau", 44, 56, "high"],
  ["Wali wa nazi", 44, 54, "high"], ["Maharagwe", 30, 40, "low"], ["Chips mayai", 38, 48, "high"],
  ["Bhajia", 24, 32, "medium"], ["Mishkaki", 2, 6, "low"], ["Shiro", 18, 26, "low"],
  ["Misir wot", 22, 30, "low"], ["Doro wat", 10, 18, "low"], ["Kitfo", 2, 6, "low"],
  ["Gomen", 8, 14, "low"], ["Atkilt wot", 20, 28, "low"], ["Kik alicha", 24, 32, "low"],
  ["Bobotie", 24, 32, "medium"], ["Pap", 40, 52, "high"], ["Chakalaka", 12, 18, "low"],
  ["Boerewors", 2, 6, "low"], ["Bunny chow", 55, 70, "high"], ["Couscous", 36, 46, "medium"],
  ["Harira", 24, 32, "low"], ["Msemen", 30, 40, "high"], ["Bissara", 24, 32, "low"],
  ["Koshari", 55, 70, "high"], ["Ful medames", 26, 34, "low"], ["Taameya", 20, 28, "low"],
  ["Molokhia", 8, 14, "low"], ["Mahshi", 30, 40, "medium"], ["Bamia", 10, 16, "low"],
  ["Jollof spaghetti", 48, 60, "high"], ["Yam porridge", 42, 54, "high"], ["Beans porridge", 32, 42, "low"],
  ["Ewa agoyin", 32, 42, "low"], ["Ofada rice", 44, 54, "high"], ["Tuwo shinkafa", 46, 58, "high"],
  ["Miyan kuka", 8, 14, "low"], ["Zobo", 10, 16, "medium"],
];

// ── Latin America ─────────────────────────────────────────────────────────────────
const LATAM: Seed[] = [
  ["Corn tortilla", 10, 15, "medium"], ["Flour tortilla", 18, 24, "high"], ["Tamal", 30, 40, "high"],
  ["Pupusa", 30, 40, "high"], ["Gallo pinto", 38, 48, "low"], ["Rice and beans", 45, 58, "medium"],
  ["Refried beans", 24, 32, "low"], ["Black beans", 26, 34, "low"], ["Moros y cristianos", 42, 54, "medium"],
  ["Tostones", 34, 44, "high"], ["Patacones", 34, 44, "high"], ["Maduros", 36, 46, "high"],
  ["Yuca frita", 38, 48, "high"], ["Yuca con mojo", 36, 46, "high"], ["Mofongo", 40, 50, "high"],
  ["Mangu", 38, 48, "medium"], ["Arroz con pollo", 48, 60, "high"], ["Arroz con gandules", 48, 60, "high"],
  ["Pabellon criollo", 50, 62, "high"], ["Feijoada", 34, 44, "low"], ["Pao de queijo", 24, 32, "high"],
  ["Coxinha", 28, 36, "high"], ["Acaraje", 22, 30, "low"], ["Moqueca", 10, 18, "low"],
  ["Farofa", 30, 40, "high"], ["Tacu tacu", 46, 58, "medium"], ["Lomo saltado", 42, 54, "high"],
  ["Ceviche", 12, 20, "low"], ["Aji de gallina", 28, 38, "medium"], ["Papa a la huancaina", 30, 40, "medium"],
  ["Causa limena", 34, 44, "medium"], ["Anticuchos", 6, 12, "low"], ["Enchiladas", 34, 44, "medium"],
  ["Chilaquiles", 36, 46, "high"], ["Quesadilla", 28, 36, "medium"], ["Tostada", 20, 28, "medium"],
  ["Sope", 26, 34, "medium"], ["Gordita", 28, 36, "medium"], ["Elote", 28, 36, "medium"],
  ["Esquites", 26, 34, "medium"], ["Pozole", 30, 40, "medium"], ["Mole poblano", 20, 30, "medium"],
  ["Chiles rellenos", 18, 26, "medium"], ["Menudo", 14, 22, "low"], ["Birria", 8, 16, "low"],
  ["Bandeja paisa", 60, 75, "high"], ["Ajiaco", 34, 44, "medium"], ["Sancocho", 36, 46, "medium"],
  ["Cachapa", 34, 44, "high"], ["Hallaca", 36, 46, "high"], ["Humita", 30, 40, "medium"],
  ["Locro", 38, 48, "medium"], ["Milanesa", 24, 32, "medium"], ["Choripan", 32, 42, "high"],
  ["Dulce de leche", 22, 30, "high"], ["Flan", 28, 36, "high"], ["Tres leches cake", 40, 50, "high"],
  ["Churros", 32, 42, "high"], ["Alfajor", 30, 40, "high"], ["Chicharron", 2, 8, "low"],
  ["Nacatamal", 34, 44, "high"], ["Baleada", 38, 48, "high"], ["Casamiento", 42, 54, "medium"],
];

// ── Other / global ─────────────────────────────────────────────────────────────────
const OTHER: Seed[] = [
  ["White bread (slice)", 12, 16, "high"], ["Whole wheat bread (slice)", 11, 15, "medium"],
  ["Multigrain bread (slice)", 10, 14, "medium"], ["Bagel", 48, 58, "high"], ["Croissant", 24, 32, "high"],
  ["Oatmeal", 24, 32, "low"], ["Steel-cut oats", 22, 30, "low"], ["Cornflakes", 24, 32, "high"],
  ["Muesli", 30, 40, "medium"], ["Granola", 34, 44, "medium"], ["Pancakes", 40, 50, "high"],
  ["Waffles", 36, 46, "high"], ["French toast", 30, 40, "high"], ["Scrambled eggs", 1, 3, "low"],
  ["Boiled egg", 0, 1, "low"], ["Omelette", 2, 4, "low"], ["Spaghetti", 42, 52, "medium"],
  ["Penne pasta", 42, 52, "medium"], ["Macaroni", 40, 50, "medium"], ["Lasagna", 38, 48, "medium"],
  ["Pizza slice", 30, 38, "high"], ["White rice", 44, 54, "high"], ["Basmati rice", 42, 52, "medium"],
  ["Quinoa", 30, 38, "low"], ["Mashed potatoes", 30, 38, "high"], ["Baked potato", 34, 44, "high"],
  ["French fries", 40, 50, "high"], ["Boiled potato", 28, 36, "medium"], ["Sweet potato", 24, 32, "medium"],
  ["Grilled chicken", 0, 2, "low"], ["Roast chicken", 0, 2, "low"], ["Grilled fish", 0, 2, "low"],
  ["Salmon fillet", 0, 2, "low"], ["Tuna salad", 6, 12, "low"], ["Caesar salad", 10, 16, "low"],
  ["Green salad", 6, 12, "low"], ["Vegetable soup", 14, 20, "low"], ["Lentil soup", 24, 32, "low"],
  ["Tomato soup", 18, 26, "medium"], ["Hummus", 14, 20, "low"], ["Falafel", 20, 28, "low"],
  ["Shawarma wrap", 42, 52, "high"], ["Doner kebab", 36, 46, "high"], ["Beef burger", 34, 44, "high"],
  ["Cheeseburger", 36, 46, "high"], ["Hot dog", 24, 32, "high"], ["Club sandwich", 34, 44, "medium"],
  ["Sushi roll", 34, 44, "high"], ["Ramen", 48, 60, "high"], ["Pad thai", 50, 62, "high"],
  ["Chow mein", 44, 54, "high"], ["Dumplings", 28, 36, "medium"], ["Fried rice", 46, 56, "high"],
  ["Apple", 20, 26, "low"], ["Banana", 24, 30, "medium"], ["Orange", 14, 18, "low"],
  ["Grapes", 24, 30, "medium"], ["Mango", 30, 38, "medium"], ["Papaya", 14, 20, "medium"],
  ["Watermelon", 10, 16, "high"], ["Guava", 14, 20, "low"], ["Pomegranate", 24, 30, "medium"],
  ["Pear", 22, 28, "low"], ["Pineapple", 20, 26, "medium"], ["Strawberries", 10, 14, "low"],
  ["Plain yogurt", 8, 12, "low"], ["Greek yogurt", 6, 10, "low"], ["Milk (glass)", 11, 14, "low"],
  ["Cheese (slice)", 0, 2, "low"], ["Peanut butter toast", 22, 30, "medium"], ["Fruit smoothie", 30, 42, "medium"],
  ["Protein shake", 8, 16, "low"], ["Dark chocolate", 12, 18, "low"], ["Ice cream (scoop)", 20, 28, "high"],
  ["Cookie", 18, 26, "high"], ["Muffin", 34, 44, "high"], ["Donut", 30, 38, "high"],
  ["Cake slice", 38, 48, "high"], ["Almonds (handful)", 4, 8, "low"], ["Mixed nuts (handful)", 6, 10, "low"],
  ["Popcorn", 18, 26, "medium"], ["Potato chips", 14, 20, "high"], ["Energy bar", 24, 32, "medium"],
  ["Orange juice (glass)", 22, 28, "high"], ["Cola (can)", 35, 42, "high"], ["Sweet tea (glass)", 20, 28, "high"],
  ["Black coffee", 0, 1, "low"], ["Chai with sugar", 10, 16, "high"], ["Avocado", 8, 12, "low"],
];

// ── India (extended) ────────────────────────────────────────────────────────────
const INDIA_EXTRA: Seed[] = [
  ["Chana chaat", 26, 34, "low"], ["Ragda pattice", 40, 50, "high"], ["Dahi vada", 24, 32, "medium"],
  ["Khandvi", 16, 22, "medium"], ["Handvo", 26, 34, "medium"], ["Muthia", 24, 32, "medium"],
  ["Patra", 20, 28, "medium"], ["Undhiyu", 28, 36, "low"], ["Sarson da saag", 10, 16, "low"],
  ["Litti chokha", 40, 50, "medium"], ["Puran poli", 42, 52, "high"], ["Pithla", 16, 22, "low"],
  ["Vangi bath", 44, 54, "high"], ["Akki roti", 30, 40, "medium"], ["Thalipeeth", 28, 36, "medium"],
  ["Sabudana vada", 30, 40, "high"], ["Batata vada", 28, 36, "high"], ["Paneer bhurji", 8, 14, "low"],
  ["Egg bhurji", 4, 8, "low"], ["Fish fry", 6, 12, "low"], ["Prawn fry", 6, 12, "low"],
  ["Chicken lollipop", 12, 18, "medium"], ["Gobi manchurian", 30, 40, "high"], ["Veg manchurian", 30, 40, "high"],
  ["Hakka noodles", 44, 54, "high"], ["Chilli paneer", 18, 26, "medium"], ["Chilli chicken", 14, 22, "medium"],
  ["Schezwan fried rice", 46, 56, "high"], ["Idiyappam", 30, 40, "medium"], ["Puttu", 34, 44, "medium"],
  ["Kozhukattai", 28, 36, "medium"], ["Adai", 24, 32, "low"], ["Aviyal", 14, 20, "low"],
  ["Thoran", 10, 16, "low"], ["Kootu", 16, 22, "low"], ["Poriyal", 10, 16, "low"],
  ["Erissery", 20, 28, "low"], ["Mor kuzhambu", 12, 18, "low"], ["Vatha kuzhambu", 14, 20, "low"],
  ["Sakkarai pongal", 44, 54, "high"], ["Unniyappam", 30, 38, "high"], ["Banana chips", 24, 32, "medium"],
  ["Murukku", 22, 30, "high"], ["Namak para", 24, 32, "high"], ["Chakli", 22, 30, "high"],
  ["Nankhatai", 24, 32, "high"], ["Chivda", 26, 34, "medium"],
];

// ── Africa (extended) ───────────────────────────────────────────────────────────
const AFRICA_EXTRA: Seed[] = [
  ["Kachumbari", 6, 12, "low"], ["Irio", 34, 44, "medium"], ["Mutura", 4, 10, "low"],
  ["Vitumbua", 28, 36, "high"], ["Mahamri", 28, 36, "high"], ["Rolex", 38, 48, "medium"],
  ["Katogo", 36, 46, "medium"], ["Fried tilapia", 2, 6, "low"], ["Mbuzi choma", 2, 6, "low"],
  ["Kuku choma", 2, 6, "low"], ["Wali wa maharage", 46, 58, "medium"], ["Ndizi na nyama", 30, 40, "medium"],
  ["Thieboudienne", 50, 62, "high"], ["Yassa poulet", 42, 54, "medium"], ["Mafe", 30, 40, "medium"],
  ["Attieke", 40, 50, "medium"], ["Alloco", 36, 46, "high"], ["Kedjenou", 8, 14, "low"],
  ["Red red", 36, 46, "low"], ["Tuo zaafi", 46, 58, "high"], ["Fried yam", 40, 50, "high"],
  ["Boli", 34, 44, "medium"], ["Abacha", 24, 32, "low"], ["Nkwobi", 8, 14, "low"],
  ["Ofe nsala", 8, 14, "low"], ["Afang soup", 8, 14, "low"], ["Oha soup", 8, 14, "low"],
  ["Banga soup", 12, 18, "low"], ["Gbegiri", 18, 26, "low"], ["Ewedu", 6, 12, "low"],
  ["Amala", 44, 56, "high"], ["Semovita", 46, 58, "high"], ["Starch", 44, 56, "high"],
  ["Ndole", 10, 16, "low"], ["Poulet DG", 34, 44, "medium"], ["Mbongo tchobi", 8, 14, "low"],
];

// ── Latin America (extended) ────────────────────────────────────────────────────
const LATAM_EXTRA: Seed[] = [
  ["Asado", 2, 6, "low"], ["Provoleta", 4, 10, "low"], ["Matambre", 10, 16, "low"],
  ["Milanesa napolitana", 30, 40, "medium"], ["Arroz chaufa", 48, 60, "high"], ["Papa rellena", 34, 44, "medium"],
  ["Salchipapas", 44, 54, "high"], ["Tallarines verdes", 46, 56, "medium"], ["Rocoto relleno", 20, 28, "medium"],
  ["Juane", 44, 54, "high"], ["Pan con chicharron", 40, 50, "high"], ["Enfrijoladas", 34, 44, "medium"],
  ["Cochinita pibil", 8, 14, "low"], ["Flautas", 30, 40, "high"], ["Tlacoyo", 30, 40, "medium"],
  ["Molletes", 34, 44, "medium"], ["Huevos rancheros", 28, 36, "medium"], ["Chilorio", 8, 14, "low"],
  ["Pozole verde", 30, 40, "medium"], ["Mondongo", 16, 24, "low"], ["Pepian", 24, 32, "medium"],
  ["Jocon", 20, 28, "low"], ["Vigoron", 36, 46, "medium"], ["Llapingachos", 36, 46, "medium"],
  ["Encebollado", 24, 32, "low"], ["Bolon de verde", 34, 44, "medium"], ["Guatita", 26, 34, "medium"],
  ["Seco de pollo", 42, 52, "high"], ["Fanesca", 34, 44, "medium"], ["Chupe de camarones", 30, 40, "medium"],
  ["Arepa de huevo", 34, 44, "high"], ["Changua", 14, 20, "medium"], ["Bistec a caballo", 44, 54, "high"],
  ["Sopa de mondongo", 18, 26, "low"], ["Carne mechada", 6, 12, "low"], ["Arroz tapado", 48, 58, "high"],
];

// ── Other / global (extended) ─────────────────────────────────────────────────────
const OTHER_EXTRA: Seed[] = [
  ["Burrito", 55, 68, "high"], ["Chimichanga", 50, 62, "high"], ["Fajitas", 40, 50, "medium"],
  ["Nachos", 40, 50, "high"], ["Guacamole", 10, 16, "low"], ["Gyro", 42, 52, "high"],
  ["Souvlaki", 34, 44, "medium"], ["Moussaka", 24, 32, "medium"], ["Spanakopita", 24, 32, "medium"],
  ["Dolma", 20, 28, "medium"], ["Tabbouleh", 18, 26, "low"], ["Fattoush", 14, 20, "low"],
  ["Baba ganoush", 10, 16, "low"], ["Kibbeh", 24, 32, "medium"], ["Manakish", 34, 44, "high"],
  ["Risotto", 44, 54, "high"], ["Gnocchi", 42, 52, "high"], ["Ravioli", 40, 50, "medium"],
  ["Paella", 46, 58, "high"], ["Tortilla espanola", 24, 32, "medium"], ["Gazpacho", 12, 18, "low"],
  ["Patatas bravas", 30, 40, "high"], ["Bruschetta", 22, 30, "medium"], ["Focaccia", 30, 40, "high"],
  ["Crepe", 26, 34, "high"], ["Quiche", 20, 28, "medium"], ["Shakshuka", 14, 22, "low"],
  ["Congee", 30, 40, "high"], ["Satay", 10, 16, "low"], ["Nasi goreng", 48, 60, "high"],
  ["Mie goreng", 50, 62, "high"], ["Rendang", 8, 14, "low"], ["Gado gado", 26, 34, "medium"],
  ["Laksa", 46, 58, "high"], ["Pho", 48, 60, "high"], ["Banh mi", 46, 56, "high"],
  ["Bibimbap", 54, 66, "high"], ["Bulgogi", 14, 22, "medium"], ["Japchae", 44, 54, "medium"],
  ["Teriyaki chicken", 24, 32, "medium"], ["Katsu curry", 60, 72, "high"], ["Tempura", 30, 40, "high"],
  ["Udon", 48, 58, "high"], ["Soba", 42, 52, "medium"], ["Onigiri", 36, 44, "high"],
  ["Mapo tofu", 12, 20, "low"], ["Kung pao chicken", 20, 28, "medium"], ["Nasi lemak", 50, 62, "high"],
  ["Roti canai", 38, 48, "high"], ["Hainanese chicken rice", 52, 64, "high"],
];

// Key aliases for the most-searched dishes (search is free & multilingual-friendly).
const ALIASES: Record<string, string[]> = {
  roti: ["chapati", "phulka", "chapathi"],
  steamed_rice: ["chawal", "plain rice", "boiled rice"],
  curd: ["dahi", "yogurt"],
  chole: ["chana masala", "chickpea curry"],
  rajma: ["kidney bean curry"],
  dosa: ["dosai"],
  idli: ["idly"],
  injera: ["enjera"],
  ugali: ["sima", "nsima"],
  jollof_rice: ["jollof"],
  corn_tortilla: ["tortilla de maiz"],
  pupusa: ["pupusas"],
  black_beans: ["frijoles negros"],
  sambar: ["sambhar"],
  biryani: ["biriyani", "biriani"],
};

// ── Real variant families (each combination is a genuine dish) ──────────────────────
interface Family {
  region: Cuisine;
  suffix: string; // appended after each prefix
  lo: number;
  hi: number;
  gi: GiBand;
  prefixes: string[];
}

const FAMILIES: Family[] = [
  // Stuffed parathas
  {
    region: "india", suffix: "paratha", lo: 28, hi: 42, gi: "medium",
    prefixes: ["Aloo", "Gobi", "Paneer", "Mooli", "Methi", "Onion", "Mixed veg", "Egg", "Keema", "Cheese", "Dal", "Cabbage", "Carrot", "Sattu", "Soya", "Plain"],
  },
  // Dosas
  {
    region: "india", suffix: "dosa", lo: 20, hi: 36, gi: "medium",
    prefixes: ["Plain", "Masala", "Rava", "Onion", "Ghee roast", "Set", "Paper", "Mysore masala", "Egg", "Cheese", "Ragi", "Wheat", "Oats"],
  },
  // Biryani by protein
  {
    region: "india", suffix: "biryani", lo: 48, hi: 62, gi: "high",
    prefixes: ["Veg", "Chicken", "Mutton", "Egg", "Fish", "Prawn", "Paneer", "Soya", "Hyderabadi dum", "Lucknowi"],
  },
  // Pulao
  {
    region: "india", suffix: "pulao", lo: 42, hi: 54, gi: "high",
    prefixes: ["Veg", "Peas", "Paneer", "Chana", "Kashmiri", "Jeera", "Mushroom"],
  },
  // Dal by lentil
  {
    region: "india", suffix: "dal", lo: 18, hi: 30, gi: "low",
    prefixes: ["Toor", "Moong", "Masoor", "Chana", "Urad", "Mixed", "Panchmel", "Tadka", "Fry", "Makhani"],
  },
  // Tacos by filling
  {
    region: "latam", suffix: "tacos", lo: 22, hi: 34, gi: "medium",
    prefixes: ["Al pastor", "Carnitas", "Barbacoa", "Carne asada", "Chicken", "Fish", "Shrimp", "Bean", "Veggie", "Chorizo", "Lengua", "Suadero"],
  },
  // Empanadas by filling
  {
    region: "latam", suffix: "empanada", lo: 20, hi: 30, gi: "high",
    prefixes: ["Beef", "Chicken", "Cheese", "Ham and cheese", "Corn", "Spinach", "Tuna", "Pork"],
  },
  // Arepas by filling
  {
    region: "latam", suffix: "arepa", lo: 28, hi: 40, gi: "medium",
    prefixes: ["Plain", "Cheese", "Reina pepiada", "Egg", "Pelua", "Domino", "Pabellon", "Carne mechada"],
  },
  // Tamales
  {
    region: "latam", suffix: "tamal", lo: 28, hi: 40, gi: "high",
    prefixes: ["Chicken", "Pork", "Cheese", "Sweet corn", "Bean", "Green", "Red"],
  },
  // Tagines by protein
  {
    region: "africa", suffix: "tagine", lo: 24, hi: 36, gi: "medium",
    prefixes: ["Chicken", "Lamb", "Beef", "Vegetable", "Fish", "Kefta", "Prune and lamb"],
  },
  // Swallows with soups (common African pairings)
  {
    region: "africa", suffix: "with egusi", lo: 46, hi: 60, gi: "high",
    prefixes: ["Fufu", "Eba", "Pounded yam", "Semovita", "Amala"],
  },
  // Suya / grilled by protein
  {
    region: "africa", suffix: "suya", lo: 2, hi: 8, gi: "low",
    prefixes: ["Beef", "Chicken", "Goat", "Ram", "Gizzard"],
  },
  // Pizza by topping
  {
    region: "other", suffix: "pizza (slice)", lo: 28, hi: 40, gi: "high",
    prefixes: ["Margherita", "Pepperoni", "Veggie", "Chicken", "Paneer", "Mushroom", "BBQ chicken", "Four cheese"],
  },
  // Sandwiches by filling
  {
    region: "other", suffix: "sandwich", lo: 26, hi: 40, gi: "medium",
    prefixes: ["Egg", "Chicken", "Tuna", "Veg", "Grilled cheese", "Paneer", "Ham", "Turkey"],
  },
  // Pasta by sauce
  {
    region: "other", suffix: "pasta", lo: 40, hi: 52, gi: "medium",
    prefixes: ["Tomato", "Pesto", "Alfredo", "Arrabiata", "Bolognese", "Primavera", "Carbonara"],
  },
  // Fried rice by protein
  {
    region: "other", suffix: "fried rice", lo: 44, hi: 56, gi: "high",
    prefixes: ["Veg", "Chicken", "Egg", "Shrimp", "Beef", "Pineapple"],
  },
  // Curry by protein (generic)
  {
    region: "other", suffix: "curry with rice", lo: 46, hi: 58, gi: "high",
    prefixes: ["Chicken", "Beef", "Lamb", "Vegetable", "Chickpea", "Lentil", "Fish"],
  },
  // Smoothie by fruit
  {
    region: "other", suffix: "smoothie", lo: 26, hi: 42, gi: "medium",
    prefixes: ["Banana", "Mango", "Berry", "Mixed fruit", "Pineapple", "Green"],
  },
  // Soups by base
  {
    region: "other", suffix: "soup", lo: 10, hi: 24, gi: "low",
    prefixes: ["Chicken", "Vegetable", "Lentil", "Tomato", "Mushroom", "Sweet corn", "Minestrone", "Hot and sour"],
  },
  // Salads by type
  {
    region: "other", suffix: "salad", lo: 6, hi: 18, gi: "low",
    prefixes: ["Green", "Greek", "Caesar", "Chickpea", "Quinoa", "Bean", "Chicken", "Tuna", "Fruit"],
  },
];

function build(): Dish[] {
  const byId = new Map<string, Dish>();
  const add = (name: string, region: Cuisine, lo: number, hi: number, gi: GiBand, swap?: string) => {
    const id = slug(name);
    if (!id || byId.has(id)) return;
    byId.set(id, {
      id,
      name,
      aliases: ALIASES[id] ?? [],
      region,
      carbsLow: lo,
      carbsHigh: hi,
      giBand: gi,
      swapIdeas: swap ?? defaultSwap(region, gi, name),
    });
  };

  const groups: [Seed[], Cuisine][] = [
    [INDIA, "india"], [INDIA_EXTRA, "india"],
    [AFRICA, "africa"], [AFRICA_EXTRA, "africa"],
    [LATAM, "latam"], [LATAM_EXTRA, "latam"],
    [OTHER, "other"], [OTHER_EXTRA, "other"],
  ];
  for (const [seeds, region] of groups) for (const [name, lo, hi, gi] of seeds) add(name, region, lo, hi, gi);

  for (const fam of FAMILIES) {
    for (const prefix of fam.prefixes) {
      const name = `${prefix} ${fam.suffix}`.replace(/\s+/g, " ").trim();
      add(name, fam.region, fam.lo, fam.hi, fam.gi);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export const DISHES: Dish[] = build();

export function dishById(id: string): Dish | undefined {
  return DISHES.find((d) => d.id === id);
}

/**
 * Free, unlimited offline search by name or alias. Optionally bias to a cuisine
 * (the user's chosen region floats to the top). Case/diacritic-insensitive.
 */
export function searchDishes(query: string, opts: { cuisine?: Cuisine; limit?: number } = {}): Dish[] {
  const q = slug(query);
  const limit = opts.limit ?? 30;
  if (!q) {
    const base = opts.cuisine ? DISHES.filter((d) => d.region === opts.cuisine) : DISHES;
    return base.slice(0, limit);
  }
  const scored = DISHES.map((d) => {
    const hay = [d.id, ...d.aliases.map(slug)];
    let score = 0;
    for (const h of hay) {
      if (h === q) score = Math.max(score, 100);
      else if (h.startsWith(q)) score = Math.max(score, 70);
      else if (h.includes(q)) score = Math.max(score, 40);
    }
    if (score && opts.cuisine && d.region === opts.cuisine) score += 15;
    return { d, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name));
  return scored.slice(0, limit).map((x) => x.d);
}

/** Midpoint carb estimate for a dish at a given portion (servings). */
export function dishCarbs(dish: Dish, portion = 1): number {
  return Math.round(((dish.carbsLow + dish.carbsHigh) / 2) * portion);
}
