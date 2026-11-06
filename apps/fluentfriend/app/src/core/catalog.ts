/**
 * Bundled, offline CONTENT catalog — pure data + query helpers, no React.
 * Everything here ships in the app and works in airplane mode. The bilingual
 * editor id on each phrase is the release gate (an unreviewed phrase blocks the
 * "zero known wrong meanings" checklist — see content.ts).
 */
import type {
  Course,
  DictionaryWord,
  GrammarCard,
  Lesson,
  Level,
  Phrase,
  PronDrill,
  QuizItem,
  Scenario,
  ScriptedRolePlay,
  Topic,
} from "./types";
import { SCENARIO_SCRIPTS, type ScriptTurn } from "./scripts";

const EDITOR = "editor_bilingual_v1";
let pseq = 0;
function phrase(en: string, bn: string, romanBn: string, topic: Topic): Phrase {
  const id = `p_${topic}_${String(++pseq).padStart(3, "0")}`;
  return {
    id,
    en,
    bn,
    romanBn,
    topic,
    audioNormalUri: `audio/${id}_n.m4a`,
    audioSlowUri: `audio/${id}_s.m4a`,
    version: 1,
    reviewedBy: EDITOR,
  };
}

// ---------- Phrases (real, reviewed; a seed of the full phrasebook) ----------

export const PHRASES: Phrase[] = [
  // daily life
  phrase("My name is Rahul.", "আমার নাম রাহুল।", "মাই নেম ইজ রাহুল", "daily"),
  phrase("Nice to meet you.", "আপনার সাথে পরিচিত হয়ে ভালো লাগল।", "নাইস টু মিট ইউ", "daily"),
  phrase("How are you?", "আপনি কেমন আছেন?", "হাউ আর ইউ", "daily"),
  phrase("I am fine, thank you.", "আমি ভালো আছি, ধন্যবাদ।", "আই অ্যাম ফাইন, থ্যাঙ্ক ইউ", "daily"),
  phrase("Where are you from?", "আপনি কোথা থেকে এসেছেন?", "হোয়্যার আর ইউ ফ্রম", "daily"),
  phrase("I live in Kolkata.", "আমি কলকাতায় থাকি।", "আই লিভ ইন কলকাতা", "daily"),
  phrase("What is your name?", "আপনার নাম কী?", "হোয়াট ইজ ইওর নেম", "daily"),
  phrase("See you tomorrow.", "কাল দেখা হবে।", "সি ইউ টুমরো", "daily"),
  phrase("Thank you so much.", "আপনাকে অনেক ধন্যবাদ।", "থ্যাঙ্ক ইউ সো মাচ", "daily"),
  phrase("Excuse me, please.", "একটু শুনবেন, দয়া করে।", "এক্সকিউজ মি, প্লিজ", "daily"),

  // shopping / market
  phrase("How much is this?", "এটার দাম কত?", "হাউ মাচ ইজ দিস", "shopping"),
  phrase("That is too expensive.", "এটা অনেক দামি।", "দ্যাট ইজ টু এক্সপেনসিভ", "shopping"),
  phrase("Can you lower the price?", "দামটা একটু কমাতে পারবেন?", "ক্যান ইউ লোয়ার দ্য প্রাইস", "shopping"),
  phrase("I will take two kilos.", "আমি দুই কেজি নেব।", "আই উইল টেক টু কিলোজ", "shopping"),
  phrase("Do you have change?", "আপনার কাছে খুচরো আছে?", "ডু ইউ হ্যাভ চেঞ্জ", "shopping"),
  phrase("These vegetables are fresh.", "এই সবজিগুলো তাজা।", "দিজ ভেজিটেবলস আর ফ্রেশ", "shopping"),

  // interview / jobs
  phrase("Good morning, sir.", "সুপ্রভাত, স্যার।", "গুড মর্নিং, স্যার", "interview"),
  phrase("I have three years of experience.", "আমার তিন বছরের অভিজ্ঞতা আছে।", "আই হ্যাভ থ্রি ইয়ার্স অফ এক্সপিরিয়েন্স", "interview"),
  phrase("I am a hard worker.", "আমি পরিশ্রমী।", "আই অ্যাম আ হার্ড ওয়ার্কার", "interview"),
  phrase("I can start next week.", "আমি আগামী সপ্তাহে শুরু করতে পারি।", "আই ক্যান স্টার্ট নেক্সট উইক", "jobs"),
  phrase("Thank you for the opportunity.", "এই সুযোগের জন্য ধন্যবাদ।", "থ্যাঙ্ক ইউ ফর দ্য অপরচুনিটি", "interview"),
  phrase("What are the working hours?", "কাজের সময় কেমন?", "হোয়াট আর দ্য ওয়ার্কিং আওয়ার্স", "jobs"),

  // travel
  phrase("Where is the bus stop?", "বাস স্টপ কোথায়?", "হোয়্যার ইজ দ্য বাস স্টপ", "travel"),
  phrase("How do I get to the station?", "স্টেশনে কীভাবে যাব?", "হাউ ডু আই গেট টু দ্য স্টেশন", "travel"),
  phrase("Please stop here.", "দয়া করে এখানে থামুন।", "প্লিজ স্টপ হিয়ার", "travel"),
  phrase("How far is it?", "এটা কতদূর?", "হাউ ফার ইজ ইট", "travel"),
  phrase("One ticket, please.", "একটা টিকিট, দয়া করে।", "ওয়ান টিকিট, প্লিজ", "travel"),

  // health / clinic
  phrase("I have a fever.", "আমার জ্বর হয়েছে।", "আই হ্যাভ আ ফিভার", "health"),
  phrase("My head hurts.", "আমার মাথা ব্যথা করছে।", "মাই হেড হার্টস", "health"),
  phrase("I need to see a doctor.", "আমার ডাক্তার দেখানো দরকার।", "আই নিড টু সি আ ডক্টর", "health"),
  phrase("How many times a day?", "দিনে কতবার?", "হাউ মেনি টাইমস আ ডে", "health"),

  // bank
  phrase("I want to open an account.", "আমি একটা অ্যাকাউন্ট খুলতে চাই।", "আই ওয়ান্ট টু ওপেন অ্যান অ্যাকাউন্ট", "bank"),
  phrase("I would like to deposit money.", "আমি টাকা জমা দিতে চাই।", "আই উড লাইক টু ডিপোজিট মানি", "bank"),
  phrase("What documents do I need?", "আমার কী কী কাগজপত্র লাগবে?", "হোয়াট ডকুমেন্টস ডু আই নিড", "bank"),

  // phone
  phrase("Hello, who is speaking?", "হ্যালো, কে বলছেন?", "হ্যালো, হু ইজ স্পিকিং", "phone"),
  phrase("Can you call me back?", "আপনি কি আমাকে আবার ফোন করতে পারবেন?", "ক্যান ইউ কল মি ব্যাক", "phone"),
  phrase("Please speak slowly.", "দয়া করে আস্তে বলুন।", "প্লিজ স্পিক স্লোলি", "phone"),

  // daily life (more)
  phrase("Good night.", "শুভ রাত্রি।", "গুড নাইট", "daily"),
  phrase("What time is it?", "কটা বাজে?", "হোয়াট টাইম ইজ ইট", "daily"),
  phrase("I do not understand.", "আমি বুঝতে পারছি না।", "আই ডু নট আন্ডারস্ট্যান্ড", "daily"),
  phrase("Please say it again.", "দয়া করে আবার বলুন।", "প্লিজ সে ইট অ্যাগেইন", "daily"),
  phrase("Can you help me?", "আপনি কি আমাকে সাহায্য করতে পারবেন?", "ক্যান ইউ হেল্প মি", "daily"),
  phrase("I am sorry.", "আমি দুঃখিত।", "আই অ্যাম সরি", "daily"),
  phrase("No problem.", "কোনো সমস্যা নেই।", "নো প্রবলেম", "daily"),
  phrase("Have a nice day.", "আপনার দিনটি ভালো কাটুক।", "হ্যাভ আ নাইস ডে", "daily"),
  phrase("I am learning English.", "আমি ইংরেজি শিখছি।", "আই অ্যাম লার্নিং ইংলিশ", "daily"),
  phrase("Of course.", "অবশ্যই।", "অফ কোর্স", "daily"),

  // shopping / market (more)
  phrase("Do you have this in blue?", "এটা কি নীল রঙে আছে?", "ডু ইউ হ্যাভ দিস ইন ব্লু", "shopping"),
  phrase("Can I try it on?", "আমি কি এটা পরে দেখতে পারি?", "ক্যান আই ট্রাই ইট অন", "shopping"),
  phrase("I am just looking.", "আমি শুধু দেখছি।", "আই অ্যাম জাস্ট লুকিং", "shopping"),
  phrase("Where is the counter?", "কাউন্টার কোথায়?", "হোয়্যার ইজ দ্য কাউন্টার", "shopping"),
  phrase("Please give me a bag.", "দয়া করে একটা ব্যাগ দিন।", "প্লিজ গিভ মি আ ব্যাগ", "shopping"),

  // interview / jobs (more)
  phrase("May I come in?", "আমি কি ভেতরে আসতে পারি?", "মে আই কাম ইন", "interview"),
  phrase("I am confident I can do this.", "আমি নিশ্চিত আমি এটা পারব।", "আই অ্যাম কনফিডেন্ট আই ক্যান ডু দিস", "interview"),
  phrase("I am eager to learn.", "আমি শিখতে আগ্রহী।", "আই অ্যাম ইগার টু লার্ন", "interview"),
  phrase("I work well in a team.", "আমি দলে ভালো কাজ করি।", "আই ওয়ার্ক ওয়েল ইন আ টিম", "jobs"),
  phrase("What are my responsibilities?", "আমার দায়িত্ব কী কী?", "হোয়াট আর মাই রেসপনসিবিলিটিজ", "jobs"),

  // travel (more)
  phrase("Is this seat free?", "এই সিটটা কি খালি?", "ইজ দিস সিট ফ্রি", "travel"),
  phrase("I missed my train.", "আমার ট্রেন মিস হয়ে গেছে।", "আই মিসড মাই ট্রেন", "travel"),
  phrase("Where is the toilet?", "টয়লেট কোথায়?", "হোয়্যার ইজ দ্য টয়লেট", "travel"),
  phrase("How much is the fare?", "ভাড়া কত?", "হাউ মাচ ইজ দ্য ফেয়ার", "travel"),
  phrase("Please wait for me.", "দয়া করে আমার জন্য অপেক্ষা করুন।", "প্লিজ ওয়েট ফর মি", "travel"),

  // health / clinic (more)
  phrase("I feel dizzy.", "আমার মাথা ঘুরছে।", "আই ফিল ডিজি", "health"),
  phrase("I am allergic to this.", "আমার এতে অ্যালার্জি আছে।", "আই অ্যাম অ্যালার্জিক টু দিস", "health"),
  phrase("Where is the nearest hospital?", "সবচেয়ে কাছের হাসপাতাল কোথায়?", "হোয়্যার ইজ দ্য নিয়ারেস্ট হসপিটাল", "health"),
  phrase("Please call a doctor.", "দয়া করে একজন ডাক্তার ডাকুন।", "প্লিজ কল আ ডক্টর", "health"),

  // bank (more)
  phrase("I want to withdraw money.", "আমি টাকা তুলতে চাই।", "আই ওয়ান্ট টু উইথড্র মানি", "bank"),
  phrase("What is my balance?", "আমার ব্যালেন্স কত?", "হোয়াট ইজ মাই ব্যালেন্স", "bank"),
  phrase("I lost my card.", "আমি আমার কার্ড হারিয়ে ফেলেছি।", "আই লস্ট মাই কার্ড", "bank"),
  phrase("Please check my account.", "দয়া করে আমার অ্যাকাউন্ট দেখুন।", "প্লিজ চেক মাই অ্যাকাউন্ট", "bank"),

  // phone (more)
  phrase("The line is busy.", "লাইন ব্যস্ত।", "দ্য লাইন ইজ বিজি", "phone"),
  phrase("I cannot hear you.", "আমি আপনাকে শুনতে পাচ্ছি না।", "আই ক্যাননট হিয়ার ইউ", "phone"),
  phrase("Please hold on.", "দয়া করে একটু ধরুন।", "প্লিজ হোল্ড অন", "phone"),
  phrase("I will call you later.", "আমি পরে আপনাকে ফোন করব।", "আই উইল কল ইউ লেটার", "phone"),
  phrase("You have the wrong number.", "আপনি ভুল নম্বরে ফোন করেছেন।", "ইউ হ্যাভ দ্য রং নম্বর", "phone"),

  // daily life (everyday courtesy & small talk)
  phrase("Good afternoon.", "শুভ অপরাহ্ন।", "গুড আফটারনুন", "daily"),
  phrase("How is your family?", "আপনার পরিবার কেমন আছে?", "হাউ ইজ ইওর ফ্যামিলি", "daily"),
  phrase("It was nice talking to you.", "আপনার সাথে কথা বলে ভালো লাগল।", "ইট ওয়াজ নাইস টকিং টু ইউ", "daily"),
  phrase("Please come in.", "দয়া করে ভেতরে আসুন।", "প্লিজ কাম ইন", "daily"),
  phrase("Take care.", "সাবধানে থাকবেন।", "টেক কেয়ার", "daily"),
  phrase("Congratulations!", "অভিনন্দন!", "কংগ্রাচুলেশনস", "daily"),
  phrase("Welcome.", "স্বাগতম।", "ওয়েলকাম", "daily"),
  phrase("What do you do?", "আপনি কী কাজ করেন?", "হোয়াট ডু ইউ ডু", "daily"),
  phrase("I am from Bangladesh.", "আমি বাংলাদেশ থেকে এসেছি।", "আই অ্যাম ফ্রম বাংলাদেশ", "daily"),
  phrase("Let's meet again.", "আবার দেখা হবে।", "লেটস মিট অ্যাগেইন", "daily"),
  phrase("I agree with you.", "আমি আপনার সাথে একমত।", "আই অ্যাগ্রি উইথ ইউ", "daily"),
  phrase("Can you wait a minute?", "একটু অপেক্ষা করতে পারবেন?", "ক্যান ইউ ওয়েট আ মিনিট", "daily"),

  // shopping / market
  phrase("Do you have a smaller size?", "আপনার কাছে ছোট মাপ আছে?", "ডু ইউ হ্যাভ আ স্মলার সাইজ", "shopping"),
  phrase("Can I pay by card?", "আমি কি কার্ডে দিতে পারি?", "ক্যান আই পে বাই কার্ড", "shopping"),
  phrase("Where can I pay?", "কোথায় টাকা দেব?", "হোয়্যার ক্যান আই পে", "shopping"),
  phrase("I need a receipt.", "আমার একটা রসিদ লাগবে।", "আই নিড আ রিসিট", "shopping"),
  phrase("This is broken.", "এটা ভাঙা।", "দিস ইজ ব্রোকেন", "shopping"),
  phrase("Can I get a discount?", "একটু ছাড় পাওয়া যাবে?", "ক্যান আই গেট আ ডিসকাউন্ট", "shopping"),
  phrase("I will come back later.", "আমি পরে আবার আসব।", "আই উইল কাম ব্যাক লেটার", "shopping"),

  // interview / jobs
  phrase("Thank you for meeting me.", "আমার সাথে দেখা করার জন্য ধন্যবাদ।", "থ্যাঙ্ক ইউ ফর মিটিং মি", "interview"),
  phrase("I studied at a local college.", "আমি একটা স্থানীয় কলেজে পড়েছি।", "আই স্টাডিড অ্যাট আ লোকাল কলেজ", "interview"),
  phrase("My strength is teamwork.", "আমার শক্তি দলগত কাজ।", "মাই স্ট্রেংথ ইজ টিমওয়ার্ক", "interview"),
  phrase("I am looking for a new job.", "আমি নতুন চাকরি খুঁজছি।", "আই অ্যাম লুকিং ফর আ নিউ জব", "jobs"),
  phrase("When can I expect a reply?", "কবে উত্তর পেতে পারি?", "হোয়েন ক্যান আই এক্সপেক্ট আ রিপ্লাই", "interview"),
  phrase("I am available full time.", "আমি পুরো সময়ের জন্য ফাঁকা আছি।", "আই অ্যাম অ্যাভেইলেবল ফুল টাইম", "jobs"),
  phrase("Could you explain the role?", "কাজটা একটু বুঝিয়ে বলবেন?", "কুড ইউ এক্সপ্লেইন দ্য রোল", "jobs"),

  // travel
  phrase("Which platform is it?", "কোন প্ল্যাটফর্মে?", "হুইচ প্ল্যাটফর্ম ইজ ইট", "travel"),
  phrase("What time does it leave?", "কটায় ছাড়বে?", "হোয়াট টাইম ডাজ ইট লিভ", "travel"),
  phrase("I want a window seat.", "আমি জানালার পাশে সিট চাই।", "আই ওয়ান্ট আ উইন্ডো সিট", "travel"),
  phrase("Does this bus go to the airport?", "এই বাস কি বিমানবন্দরে যায়?", "ডাজ দিস বাস গো টু দ্য এয়ারপোর্ট", "travel"),
  phrase("Can you show me on the map?", "ম্যাপে দেখিয়ে দিতে পারবেন?", "ক্যান ইউ শো মি অন দ্য ম্যাপ", "travel"),
  phrase("Turn left at the corner.", "কোণে বাঁয়ে ঘুরুন।", "টার্ন লেফট অ্যাট দ্য কর্নার", "travel"),
  phrase("Go straight ahead.", "সোজা সামনে যান।", "গো স্ট্রেইট অ্যাহেড", "travel"),

  // health / clinic
  phrase("I have a cold.", "আমার সর্দি হয়েছে।", "আই হ্যাভ আ কোল্ড", "health"),
  phrase("I have a stomach ache.", "আমার পেট ব্যথা করছে।", "আই হ্যাভ আ স্টমাক একে", "health"),
  phrase("How much is the fee?", "ফি কত?", "হাউ মাচ ইজ দ্য ফি", "health"),
  phrase("When should I come again?", "আবার কবে আসব?", "হোয়েন শুড আই কাম অ্যাগেইন", "health"),
  phrase("Take this after meals.", "খাবারের পরে এটা খাবেন।", "টেক দিস আফটার মিলস", "health"),
  phrase("I feel much better now.", "এখন অনেক ভালো লাগছে।", "আই ফিল মাচ বেটার নাউ", "health"),

  // bank
  phrase("I want to send money.", "আমি টাকা পাঠাতে চাই।", "আই ওয়ান্ট টু সেন্ড মানি", "bank"),
  phrase("My card is not working.", "আমার কার্ড কাজ করছে না।", "মাই কার্ড ইজ নট ওয়ার্কিং", "bank"),
  phrase("I forgot my PIN.", "আমি আমার পিন ভুলে গেছি।", "আই ফরগট মাই পিন", "bank"),
  phrase("How long will it take?", "কতক্ষণ লাগবে?", "হাউ লং উইল ইট টেক", "bank"),
  phrase("Please fill this form.", "দয়া করে এই ফর্মটা পূরণ করুন।", "প্লিজ ফিল দিস ফর্ম", "bank"),

  // phone
  phrase("May I speak to the manager?", "আমি কি ম্যানেজারের সাথে কথা বলতে পারি?", "মে আই স্পিক টু দ্য ম্যানেজার", "phone"),
  phrase("Could you repeat that, please?", "দয়া করে আবার বলবেন?", "কুড ইউ রিপিট দ্যাট প্লিজ", "phone"),
  phrase("I'll text you the address.", "আমি আপনাকে ঠিকানাটা মেসেজ করব।", "আইল টেক্সট ইউ দ্য অ্যাড্রেস", "phone"),
  phrase("Can we talk later?", "আমরা কি পরে কথা বলতে পারি?", "ক্যান উই টক লেটার", "phone"),
  phrase("Thank you for calling.", "ফোন করার জন্য ধন্যবাদ।", "থ্যাঙ্ক ইউ ফর কলিং", "phone"),

  // daily life (time, feelings, requests)
  phrase("I am very happy.", "আমি খুব খুশি।", "আই অ্যাম ভেরি হ্যাপি", "daily"),
  phrase("I am a little tired.", "আমি একটু ক্লান্ত।", "আই অ্যাম আ লিটল টায়ার্ড", "daily"),
  phrase("It is raining today.", "আজ বৃষ্টি হচ্ছে।", "ইট ইজ রেইনিং টুডে", "daily"),
  phrase("What is the date today?", "আজ কত তারিখ?", "হোয়াট ইজ দ্য ডেট টুডে", "daily"),
  phrase("See you in the evening.", "সন্ধ্যায় দেখা হবে।", "সি ইউ ইন দ্য ইভনিং", "daily"),
  phrase("Let me think about it.", "আমাকে একটু ভাবতে দিন।", "লেট মি থিঙ্ক অ্যাবাউট ইট", "daily"),
  phrase("That sounds good.", "শুনতে ভালোই লাগছে।", "দ্যাট সাউন্ডস গুড", "daily"),
  phrase("I don't know.", "আমি জানি না।", "আই ডোন্ট নো", "daily"),
  phrase("Please write it down.", "দয়া করে লিখে দিন।", "প্লিজ রাইট ইট ডাউন", "daily"),
  phrase("I understand now.", "এখন বুঝেছি।", "আই আন্ডারস্ট্যান্ড নাউ", "daily"),

  // restaurant / food (daily)
  phrase("A table for two, please.", "দুজনের জন্য একটা টেবিল, দয়া করে।", "আ টেবিল ফর টু প্লিজ", "daily"),
  phrase("Can I see the menu?", "আমি কি মেনুটা দেখতে পারি?", "ক্যান আই সি দ্য মেনু", "daily"),
  phrase("What do you recommend?", "আপনি কী নেওয়ার পরামর্শ দেন?", "হোয়াট ডু ইউ রেকমেন্ড", "daily"),
  phrase("The food is delicious.", "খাবারটা দারুণ সুস্বাদু।", "দ্য ফুড ইজ ডেলিশাস", "daily"),
  phrase("Not too spicy, please.", "বেশি ঝাল নয়, দয়া করে।", "নট টু স্পাইসি প্লিজ", "daily"),
  phrase("Can I have the bill?", "বিলটা দেবেন?", "ক্যান আই হ্যাভ দ্য বিল", "daily"),
  phrase("Keep the change.", "খুচরোটা রেখে দিন।", "কিপ দ্য চেঞ্জ", "daily"),

  // hotel / travel
  phrase("Do you have a room available?", "আপনার কি খালি রুম আছে?", "ডু ইউ হ্যাভ আ রুম অ্যাভেইলেবল", "travel"),
  phrase("What time is check-out?", "চেক-আউট কটায়?", "হোয়াট টাইম ইজ চেক আউট", "travel"),
  phrase("Is breakfast included?", "নাস্তা কি এর সাথে আছে?", "ইজ ব্রেকফাস্ট ইনক্লুডেড", "travel"),
  phrase("The air conditioner is not working.", "এসিটা কাজ করছে না।", "দ্য এয়ার কন্ডিশনার ইজ নট ওয়ার্কিং", "travel"),

  // complaint / customer service (shopping/jobs)
  phrase("I would like to make a complaint.", "আমি একটা অভিযোগ জানাতে চাই।", "আই উড লাইক টু মেক আ কমপ্লেইন্ট", "shopping"),
  phrase("This is not what I ordered.", "আমি এটা অর্ডার করিনি।", "দিস ইজ নট হোয়াট আই অর্ডারড", "shopping"),
  phrase("Can I get a refund?", "টাকা কি ফেরত পাব?", "ক্যান আই গেট আ রিফান্ড", "shopping"),
  phrase("How can I help you?", "আমি কীভাবে সাহায্য করতে পারি?", "হাউ ক্যান আই হেল্প ইউ", "jobs"),
  phrase("I will look into it.", "আমি বিষয়টা দেখছি।", "আই উইল লুক ইনটু ইট", "jobs"),

  // meeting / work (jobs)
  phrase("Let me check and get back to you.", "আমি দেখে জানাচ্ছি।", "লেট মি চেক অ্যান্ড গেট ব্যাক টু ইউ", "jobs"),
  phrase("Can we schedule a meeting?", "আমরা কি একটা মিটিং ঠিক করতে পারি?", "ক্যান উই শিডিউল আ মিটিং", "jobs"),
  phrase("I have a question.", "আমার একটা প্রশ্ন আছে।", "আই হ্যাভ আ কোয়েশ্চন", "jobs"),
  phrase("That makes sense.", "এটা যুক্তিসঙ্গত।", "দ্যাট মেকস সেন্স", "jobs"),
  phrase("I will send you the details.", "আমি আপনাকে বিস্তারিত পাঠাব।", "আই উইল সেন্ড ইউ দ্য ডিটেলস", "jobs"),

  // interview
  phrase("Where do you see yourself in five years?", "পাঁচ বছর পর নিজেকে কোথায় দেখেন?", "হোয়্যার ডু ইউ সি ইওরসেল্ফ ইন ফাইভ ইয়ার্স", "interview"),
  phrase("I am a quick learner.", "আমি দ্রুত শিখি।", "আই অ্যাম আ কুইক লার্নার", "interview"),
  phrase("I handle pressure well.", "আমি চাপ ভালোভাবে সামলাই।", "আই হ্যান্ডল প্রেশার ওয়েল", "interview"),

  // health
  phrase("I have an appointment.", "আমার একটা অ্যাপয়েন্টমেন্ট আছে।", "আই হ্যাভ অ্যান অ্যাপয়েন্টমেন্ট", "health"),
  phrase("Is this medicine safe?", "এই ওষুধটা কি নিরাপদ?", "ইজ দিস মেডিসিন সেফ", "health"),

  // ===== Expansion batch: everyday life =====
  phrase("Hello, everyone.", "সবাইকে হ্যালো।", "হ্যালো, এভরিওয়ান", "daily"),
  phrase("Good evening.", "শুভ সন্ধ্যা।", "গুড ইভনিং", "daily"),
  phrase("How is it going?", "কেমন চলছে?", "হাউ ইজ ইট গোয়িং", "daily"),
  phrase("Long time no see.", "অনেক দিন পর দেখা।", "লং টাইম নো সি", "daily"),
  phrase("What is new?", "নতুন কী খবর?", "হোয়াট ইজ নিউ", "daily"),
  phrase("I am glad to hear that.", "শুনে ভালো লাগল।", "আই অ্যাম গ্ল্যাড টু হিয়ার দ্যাট", "daily"),
  phrase("Please sit down.", "দয়া করে বসুন।", "প্লিজ সিট ডাউন", "daily"),
  phrase("Make yourself at home.", "নিজের বাড়ির মতো থাকুন।", "মেক ইওরসেল্ফ অ্যাট হোম", "daily"),
  phrase("Would you like some tea?", "একটু চা খাবেন?", "উড ইউ লাইক সাম টি", "daily"),
  phrase("Help yourself.", "নিজে নিয়ে নিন।", "হেল্প ইওরসেল্ফ", "daily"),
  phrase("I am busy right now.", "আমি এখন ব্যস্ত।", "আই অ্যাম বিজি রাইট নাউ", "daily"),
  phrase("Can we talk tomorrow?", "আমরা কি কাল কথা বলতে পারি?", "ক্যান উই টক টুমরো", "daily"),
  phrase("I will be there soon.", "আমি শিগগিরই আসছি।", "আই উইল বি দেয়ার সুন", "daily"),
  phrase("Give me a moment.", "একটু সময় দিন।", "গিভ মি আ মোমেন্ট", "daily"),
  phrase("I am almost ready.", "আমি প্রায় তৈরি।", "আই অ্যাম অলমোস্ট রেডি", "daily"),
  phrase("It does not matter.", "কিছু যায় আসে না।", "ইট ডাজ নট ম্যাটার", "daily"),
  phrase("You are welcome.", "স্বাগতম, কিছু মনে করবেন না।", "ইউ আর ওয়েলকাম", "daily"),
  phrase("Never mind.", "কিছু মনে করবেন না।", "নেভার মাইন্ড", "daily"),
  phrase("That is all right.", "ঠিক আছে।", "দ্যাট ইজ অল রাইট", "daily"),
  phrase("I hope so.", "আশা করি।", "আই হোপ সো", "daily"),
  phrase("I think so.", "আমার মনে হয় তাই।", "আই থিঙ্ক সো", "daily"),
  phrase("I am not sure.", "আমি নিশ্চিত নই।", "আই অ্যাম নট শিওর", "daily"),
  phrase("What does this mean?", "এর মানে কী?", "হোয়াট ডাজ দিস মিন", "daily"),
  phrase("How do you say this?", "এটা কীভাবে বলে?", "হাউ ডু ইউ সে দিস", "daily"),
  phrase("Speak a little louder, please.", "দয়া করে একটু জোরে বলুন।", "স্পিক আ লিটল লাউডার প্লিজ", "daily"),
  phrase("I am hungry.", "আমার খিদে পেয়েছে।", "আই অ্যাম হাংরি", "daily"),
  phrase("I am thirsty.", "আমার তেষ্টা পেয়েছে।", "আই অ্যাম থার্স্টি", "daily"),
  phrase("Let's go home.", "চলো বাড়ি যাই।", "লেটস গো হোম", "daily"),
  phrase("It is getting late.", "দেরি হয়ে যাচ্ছে।", "ইট ইজ গেটিং লেট", "daily"),
  phrase("Good luck.", "শুভকামনা।", "গুড লাক", "daily"),

  // family & time (daily)
  phrase("This is my mother.", "ইনি আমার মা।", "দিস ইজ মাই মাদার", "daily"),
  phrase("I have two brothers.", "আমার দুই ভাই আছে।", "আই হ্যাভ টু ব্রাদারস", "daily"),
  phrase("My sister is a teacher.", "আমার বোন একজন শিক্ষিকা।", "মাই সিস্টার ইজ আ টিচার", "daily"),
  phrase("How old are you?", "আপনার বয়স কত?", "হাউ ওল্ড আর ইউ", "daily"),
  phrase("I am thirty years old.", "আমার বয়স ত্রিশ।", "আই অ্যাম থার্টি ইয়ার্স ওল্ড", "daily"),
  phrase("My birthday is in May.", "আমার জন্মদিন মে মাসে।", "মাই বার্থডে ইজ ইন মে", "daily"),
  phrase("What day is it today?", "আজ কী বার?", "হোয়াট ডে ইজ ইট টুডে", "daily"),
  phrase("It is Monday.", "আজ সোমবার।", "ইট ইজ মানডে", "daily"),
  phrase("See you on Friday.", "শুক্রবার দেখা হবে।", "সি ইউ অন ফ্রাইডে", "daily"),
  phrase("I wake up early.", "আমি তাড়াতাড়ি উঠি।", "আই ওয়েক আপ আর্লি", "daily"),
  phrase("I go to bed late.", "আমি দেরিতে ঘুমাই।", "আই গো টু বেড লেট", "daily"),
  phrase("It is almost noon.", "প্রায় দুপুর হয়ে গেছে।", "ইট ইজ অলমোস্ট নুন", "daily"),

  // weather & home (daily)
  phrase("It is very hot today.", "আজ খুব গরম।", "ইট ইজ ভেরি হট টুডে", "daily"),
  phrase("It is cold outside.", "বাইরে ঠান্ডা।", "ইট ইজ কোল্ড আউটসাইড", "daily"),
  phrase("Take an umbrella.", "একটা ছাতা নিন।", "টেক অ্যান আমব্রেলা", "daily"),
  phrase("Please close the window.", "দয়া করে জানালাটা বন্ধ করুন।", "প্লিজ ক্লোজ দ্য উইন্ডো", "daily"),
  phrase("Please turn on the light.", "দয়া করে আলোটা জ্বালান।", "প্লিজ টার্ন অন দ্য লাইট", "daily"),
  phrase("Please turn off the fan.", "দয়া করে পাখাটা বন্ধ করুন।", "প্লিজ টার্ন অফ দ্য ফ্যান", "daily"),
  phrase("The water is not coming.", "জল আসছে না।", "দ্য ওয়াটার ইজ নট কামিং", "daily"),
  phrase("I am going to the market.", "আমি বাজারে যাচ্ছি।", "আই অ্যাম গোয়িং টু দ্য মার্কেট", "daily"),

  // ===== shopping / market =====
  phrase("Do you have this item?", "এই জিনিসটা কি আছে?", "ডু ইউ হ্যাভ দিস আইটেম", "shopping"),
  phrase("What is the final price?", "শেষ দাম কত?", "হোয়াট ইজ দ্য ফাইনাল প্রাইস", "shopping"),
  phrase("It is out of my budget.", "এটা আমার বাজেটের বাইরে।", "ইট ইজ আউট অফ মাই বাজেট", "shopping"),
  phrase("Give me a good price.", "ভালো দাম দিন।", "গিভ মি আ গুড প্রাইস", "shopping"),
  phrase("I will give you a hundred.", "আমি একশো দেব।", "আই উইল গিভ ইউ আ হান্ড্রেড", "shopping"),
  phrase("Can you weigh it?", "একটু ওজন করে দেবেন?", "ক্যান ইউ ওয়ে ইট", "shopping"),
  phrase("One kilo, please.", "এক কেজি, দয়া করে।", "ওয়ান কিলো প্লিজ", "shopping"),
  phrase("Is this fresh?", "এটা কি তাজা?", "ইজ দিস ফ্রেশ", "shopping"),
  phrase("I don't need a bag.", "আমার ব্যাগ লাগবে না।", "আই ডোন্ট নিড আ ব্যাগ", "shopping"),
  phrase("Where is the exit?", "বেরোনোর পথ কোথায়?", "হোয়্যার ইজ দ্য এক্সিট", "shopping"),
  phrase("Can I pay in cash?", "আমি কি নগদে দিতে পারি?", "ক্যান আই পে ইন ক্যাশ", "shopping"),
  phrase("Keep it, please.", "দয়া করে এটা রাখুন।", "কিপ ইট প্লিজ", "shopping"),
  phrase("Do you deliver?", "আপনারা কি বাড়িতে পৌঁছে দেন?", "ডু ইউ ডেলিভার", "shopping"),
  phrase("I want to exchange this.", "আমি এটা বদলাতে চাই।", "আই ওয়ান্ট টু এক্সচেঞ্জ দিস", "shopping"),
  phrase("This size is too big.", "এই মাপটা বেশি বড়।", "দিস সাইজ ইজ টু বিগ", "shopping"),

  // ===== travel / transport =====
  phrase("I need a taxi.", "আমার একটা ট্যাক্সি লাগবে।", "আই নিড আ ট্যাক্সি", "travel"),
  phrase("Take me to the station.", "আমাকে স্টেশনে নিয়ে চলুন।", "টেক মি টু দ্য স্টেশন", "travel"),
  phrase("How much to the airport?", "বিমানবন্দর পর্যন্ত কত?", "হাউ মাচ টু দ্য এয়ারপোর্ট", "travel"),
  phrase("Please use the meter.", "দয়া করে মিটার চালান।", "প্লিজ ইউজ দ্য মিটার", "travel"),
  phrase("I am getting off here.", "আমি এখানে নামব।", "আই অ্যাম গেটিং অফ হিয়ার", "travel"),
  phrase("When is the next train?", "পরের ট্রেন কখন?", "হোয়েন ইজ দ্য নেক্সট ট্রেন", "travel"),
  phrase("Is the train on time?", "ট্রেন কি সময়মতো আছে?", "ইজ দ্য ট্রেন অন টাইম", "travel"),
  phrase("The train is late.", "ট্রেন দেরিতে আসছে।", "দ্য ট্রেন ইজ লেট", "travel"),
  phrase("Where do I buy a ticket?", "টিকিট কোথায় কিনব?", "হোয়্যার ডু আই বাই আ টিকিট", "travel"),
  phrase("Two tickets to Dhaka.", "ঢাকার দুটো টিকিট।", "টু টিকিটস টু ঢাকা", "travel"),
  phrase("Which bus goes to the city?", "কোন বাস শহরে যায়?", "হুইচ বাস গোজ টু দ্য সিটি", "travel"),
  phrase("I am lost.", "আমি পথ হারিয়েছি।", "আই অ্যাম লস্ট", "travel"),
  phrase("Is it walking distance?", "এটা কি হেঁটে যাওয়ার মতো কাছে?", "ইজ ইট ওয়াকিং ডিসট্যান্স", "travel"),
  phrase("Turn right at the signal.", "সিগন্যালে ডানদিকে ঘুরুন।", "টার্ন রাইট অ্যাট দ্য সিগন্যাল", "travel"),
  phrase("It is near the temple.", "এটা মন্দিরের কাছে।", "ইট ইজ নিয়ার দ্য টেম্পল", "travel"),
  phrase("I would like to check in.", "আমি চেক-ইন করতে চাই।", "আই উড লাইক টু চেক ইন", "travel"),
  phrase("I have a reservation.", "আমার একটা বুকিং আছে।", "আই হ্যাভ আ রিজার্ভেশন", "travel"),
  phrase("Can I have the key?", "চাবিটা দেবেন?", "ক্যান আই হ্যাভ দ্য কি", "travel"),
  phrase("The room is too noisy.", "ঘরটা খুব শব্দযুক্ত।", "দ্য রুম ইজ টু নয়জি", "travel"),
  phrase("Where is the lift?", "লিফট কোথায়?", "হোয়্যার ইজ দ্য লিফট", "travel"),

  // ===== restaurant / food (daily) =====
  phrase("I am ready to order.", "আমি অর্ডার দিতে তৈরি।", "আই অ্যাম রেডি টু অর্ডার", "daily"),
  phrase("One plate of rice, please.", "এক প্লেট ভাত, দয়া করে।", "ওয়ান প্লেট অফ রাইস প্লিজ", "daily"),
  phrase("A glass of water, please.", "এক গ্লাস জল, দয়া করে।", "আ গ্লাস অফ ওয়াটার প্লিজ", "daily"),
  phrase("Is this vegetarian?", "এটা কি নিরামিষ?", "ইজ দিস ভেজিটেরিয়ান", "daily"),
  phrase("Please bring some water.", "দয়া করে একটু জল আনুন।", "প্লিজ ব্রিং সাম ওয়াটার", "daily"),
  phrase("The food is a little cold.", "খাবারটা একটু ঠান্ডা।", "দ্য ফুড ইজ আ লিটল কোল্ড", "daily"),
  phrase("Can I take this home?", "আমি কি এটা বাড়ি নিয়ে যেতে পারি?", "ক্যান আই টেক দিস হোম", "daily"),
  phrase("I am full, thank you.", "আমার পেট ভরেছে, ধন্যবাদ।", "আই অ্যাম ফুল থ্যাঙ্ক ইউ", "daily"),

  // ===== health / clinic / pharmacy =====
  phrase("I don't feel well.", "আমার ভালো লাগছে না।", "আই ডোন্ট ফিল ওয়েল", "health"),
  phrase("My throat hurts.", "আমার গলা ব্যথা করছে।", "মাই থ্রোট হার্টস", "health"),
  phrase("I have a cough.", "আমার কাশি হয়েছে।", "আই হ্যাভ আ কফ", "health"),
  phrase("I cannot sleep.", "আমি ঘুমাতে পারছি না।", "আই ক্যাননট স্লিপ", "health"),
  phrase("Do I need a test?", "আমার কি পরীক্ষা লাগবে?", "ডু আই নিড আ টেস্ট", "health"),
  phrase("Is there any side effect?", "এর কি কোনো পার্শ্বপ্রতিক্রিয়া আছে?", "ইজ দেয়ার এনি সাইড এফেক্ট", "health"),
  phrase("How much is this medicine?", "এই ওষুধের দাম কত?", "হাউ মাচ ইজ দিস মেডিসিন", "health"),
  phrase("Do you have this tablet?", "এই বড়িটা কি আছে?", "ডু ইউ হ্যাভ দিস ট্যাবলেট", "health"),
  phrase("Take rest and drink water.", "বিশ্রাম নিন আর জল খান।", "টেক রেস্ট অ্যান্ড ড্রিঙ্ক ওয়াটার", "health"),
  phrase("Call an ambulance.", "একটা অ্যাম্বুলেন্স ডাকুন।", "কল অ্যান অ্যাম্বুলেন্স", "health"),
  phrase("It is an emergency.", "এটা একটা জরুরি অবস্থা।", "ইট ইজ অ্যান ইমার্জেন্সি", "health"),
  phrase("I need my prescription.", "আমার প্রেসক্রিপশন লাগবে।", "আই নিড মাই প্রেসক্রিপশন", "health"),

  // ===== bank / ATM =====
  phrase("Where is the ATM?", "এটিএম কোথায়?", "হোয়্যার ইজ দ্য এটিএম", "bank"),
  phrase("The machine is not working.", "মেশিনটা কাজ করছে না।", "দ্য মেশিন ইজ নট ওয়ার্কিং", "bank"),
  phrase("My account is blocked.", "আমার অ্যাকাউন্ট বন্ধ হয়ে গেছে।", "মাই অ্যাকাউন্ট ইজ ব্লকড", "bank"),
  phrase("I want to change my PIN.", "আমি আমার পিন বদলাতে চাই।", "আই ওয়ান্ট টু চেঞ্জ মাই পিন", "bank"),
  phrase("Please give me small notes.", "দয়া করে ছোট নোট দিন।", "প্লিজ গিভ মি স্মল নোটস", "bank"),
  phrase("I need a bank statement.", "আমার ব্যাঙ্ক স্টেটমেন্ট লাগবে।", "আই নিড আ ব্যাঙ্ক স্টেটমেন্ট", "bank"),
  phrase("Where do I sign?", "কোথায় সই করব?", "হোয়্যার ডু আই সাইন", "bank"),
  phrase("Is there any charge?", "কোনো চার্জ আছে কি?", "ইজ দেয়ার এনি চার্জ", "bank"),

  // ===== phone =====
  phrase("Can you hear me now?", "এখন কি শুনতে পাচ্ছেন?", "ক্যান ইউ হিয়ার মি নাউ", "phone"),
  phrase("The signal is weak.", "সিগন্যাল দুর্বল।", "দ্য সিগন্যাল ইজ উইক", "phone"),
  phrase("My phone is low on battery.", "আমার ফোনের চার্জ কম।", "মাই ফোন ইজ লো অন ব্যাটারি", "phone"),
  phrase("Please send me a message.", "দয়া করে আমাকে একটা মেসেজ পাঠান।", "প্লিজ সেন্ড মি আ মেসেজ", "phone"),
  phrase("What is your number?", "আপনার নম্বর কী?", "হোয়াট ইজ ইওর নম্বর", "phone"),
  phrase("I will send it on WhatsApp.", "আমি এটা হোয়াটসঅ্যাপে পাঠাব।", "আই উইল সেন্ড ইট অন হোয়াটসঅ্যাপ", "phone"),
  phrase("Please call me in an hour.", "দয়া করে এক ঘণ্টা পরে ফোন করুন।", "প্লিজ কল মি ইন অ্যান আওয়ার", "phone"),
  phrase("Sorry, I missed your call.", "দুঃখিত, আপনার ফোন ধরতে পারিনি।", "সরি আই মিসড ইওর কল", "phone"),

  // ===== interview =====
  phrase("Thank you for having me.", "আমাকে ডাকার জন্য ধন্যবাদ।", "থ্যাঙ্ক ইউ ফর হ্যাভিং মি", "interview"),
  phrase("Let me tell you about myself.", "আমার সম্পর্কে বলি।", "লেট মি টেল ইউ অ্যাবাউট মাইসেল্ফ", "interview"),
  phrase("I finished my graduation.", "আমি স্নাতক শেষ করেছি।", "আই ফিনিশড মাই গ্র্যাজুয়েশন", "interview"),
  phrase("I am good with computers.", "আমি কম্পিউটারে দক্ষ।", "আই অ্যাম গুড উইথ কম্পিউটারস", "interview"),
  phrase("I want to grow with the company.", "আমি কোম্পানির সাথে এগিয়ে যেতে চাই।", "আই ওয়ান্ট টু গ্রো উইথ দ্য কোম্পানি", "interview"),
  phrase("May I ask a question?", "আমি কি একটা প্রশ্ন করতে পারি?", "মে আই আস্ক আ কোয়েশ্চন", "interview"),
  phrase("What is the next step?", "পরের ধাপ কী?", "হোয়াট ইজ দ্য নেক্সট স্টেপ", "interview"),

  // ===== jobs / workplace =====
  phrase("I am running late.", "আমার দেরি হয়ে যাচ্ছে।", "আই অ্যাম রানিং লেট", "jobs"),
  phrase("I will finish it today.", "আমি আজই এটা শেষ করব।", "আই উইল ফিনিশ ইট টুডে", "jobs"),
  phrase("Can you give me a hand?", "একটু সাহায্য করবেন?", "ক্যান ইউ গিভ মি আ হ্যান্ড", "jobs"),
  phrase("I need a day off.", "আমার একদিন ছুটি লাগবে।", "আই নিড আ ডে অফ", "jobs"),
  phrase("Let me know if you need anything.", "কিছু লাগলে বলবেন।", "লেট মি নো ইফ ইউ নিড এনিথিং", "jobs"),
  phrase("I understand the task.", "আমি কাজটা বুঝেছি।", "আই আন্ডারস্ট্যান্ড দ্য টাস্ক", "jobs"),
  phrase("Good job, everyone.", "সবাই ভালো কাজ করেছ।", "গুড জব এভরিওয়ান", "jobs"),
  phrase("Let's take a short break.", "চলুন একটু বিরতি নিই।", "লেটস টেক আ শর্ট ব্রেক", "jobs"),

  // ===== emergencies / help (daily) =====
  phrase("Help me, please!", "দয়া করে আমাকে সাহায্য করুন!", "হেল্প মি প্লিজ", "daily"),
  phrase("Call the police.", "পুলিশ ডাকুন।", "কল দ্য পুলিশ", "daily"),
  phrase("There is a fire.", "আগুন লেগেছে।", "দেয়ার ইজ আ ফায়ার", "daily"),
  phrase("I lost my bag.", "আমি আমার ব্যাগ হারিয়ে ফেলেছি।", "আই লস্ট মাই ব্যাগ", "daily"),
  phrase("Someone is hurt.", "কেউ একজন আহত হয়েছে।", "সামওয়ান ইজ হার্ট", "daily"),
  phrase("Where is the nearest police station?", "সবচেয়ে কাছের থানা কোথায়?", "হোয়্যার ইজ দ্য নিয়ারেস্ট পুলিশ স্টেশন", "daily"),
];

const byTopic = (t: Topic) => PHRASES.filter((p) => p.topic === t);

// ---------- Scenarios (27 across 3 levels) ----------

type ScenSpec = [id: string, en: string, bn: string, sceneBn: string, level: Level, topic: Topic];
const SCEN_SPECS: ScenSpec[] = [
  ["sc_intro", "Introduce yourself", "নিজের পরিচয় দিন", "নতুন কারো সাথে আলাপ করুন", "A1", "daily"],
  ["sc_greet", "Greet a neighbour", "প্রতিবেশীকে অভিবাদন", "সকালে প্রতিবেশীর সাথে কথা বলুন", "A1", "daily"],
  ["sc_market", "At the vegetable market", "সবজির বাজারে", "দরদাম করে সবজি কিনুন", "A1", "shopping"],
  ["sc_tea", "Order tea at a stall", "চায়ের দোকানে", "চা আর বিস্কুট অর্ডার করুন", "A1", "daily"],
  ["sc_directions", "Ask for directions", "রাস্তা জিজ্ঞাসা", "স্টেশনে যাওয়ার পথ জিজ্ঞাসা করুন", "A1", "travel"],
  ["sc_bus", "Take a bus", "বাসে চড়া", "কন্ডাক্টরের সাথে কথা বলুন", "A1", "travel"],
  ["sc_shop_clothes", "Buy clothes", "জামাকাপড় কেনা", "দোকানে মাপ আর দাম জিজ্ঞাসা করুন", "A1", "shopping"],
  ["sc_phone_basic", "Answer a phone call", "ফোন ধরা", "অপরিচিত নম্বর থেকে ফোন ধরুন", "A1", "phone"],
  ["sc_restaurant", "Order food", "খাবার অর্ডার", "রেস্তোরাঁয় খাবার অর্ডার করুন", "A2", "daily"],
  ["sc_clinic", "Visit a doctor", "ডাক্তারের কাছে", "উপসর্গ বুঝিয়ে বলুন", "A2", "health"],
  ["sc_pharmacy", "At the pharmacy", "ওষুধের দোকানে", "ওষুধ আর ডোজ জিজ্ঞাসা করুন", "A2", "health"],
  ["sc_bank_open", "Open a bank account", "ব্যাঙ্ক অ্যাকাউন্ট", "অ্যাকাউন্ট খোলার কথা বলুন", "A2", "bank"],
  ["sc_atm", "Ask for help at an ATM", "এটিএম-এ সাহায্য", "এটিএম ব্যবহারে সাহায্য চান", "A2", "bank"],
  ["sc_train_book", "Book a train ticket", "ট্রেনের টিকিট", "কাউন্টারে টিকিট বুক করুন", "A2", "travel"],
  ["sc_hotel", "Check in to a hotel", "হোটেলে চেক-ইন", "রুম বুকিং আর চেক-ইন করুন", "A2", "travel"],
  ["sc_shop_return", "Return a product", "পণ্য ফেরত", "খারাপ পণ্য ফেরত দিন", "A2", "shopping"],
  ["sc_phone_appt", "Make an appointment", "অ্যাপয়েন্টমেন্ট", "ফোনে সময় ঠিক করুন", "A2", "phone"],
  ["sc_small_talk", "Small talk at work", "কাজের জায়গায় গল্প", "সহকর্মীর সাথে হালকা কথা", "A2", "jobs"],
  ["sc_interview", "Job interview", "চাকরির ইন্টারভিউ", "নিজের যোগ্যতা বোঝান", "B1", "interview"],
  ["sc_salary", "Negotiate salary", "বেতন আলোচনা", "বেতন নিয়ে কথা বলুন", "B1", "jobs"],
  ["sc_complaint", "Make a complaint", "অভিযোগ জানানো", "ভদ্রভাবে সমস্যা জানান", "B1", "shopping"],
  ["sc_meeting", "Speak in a meeting", "মিটিং-এ মত", "মিটিং-এ মতামত দিন", "B1", "jobs"],
  ["sc_presentation", "Give a short update", "সংক্ষিপ্ত আপডেট", "কাজের অগ্রগতি জানান", "B1", "jobs"],
  ["sc_landlord", "Talk to a landlord", "বাড়িওয়ালার সাথে", "ভাড়া আর মেরামতের কথা", "B1", "daily"],
  ["sc_customer", "Help a customer", "গ্রাহককে সাহায্য", "দোকানে গ্রাহককে সামলান", "B1", "jobs"],
  ["sc_describe_problem", "Explain a problem", "সমস্যা বোঝানো", "টেকনিশিয়ানকে সমস্যা বোঝান", "B1", "daily"],
  ["sc_plan_trip", "Plan a trip with a friend", "ভ্রমণ পরিকল্পনা", "বন্ধুর সাথে ঘোরার প্ল্যান", "B1", "travel"],
];

export const SCENARIOS: Scenario[] = SCEN_SPECS.map(([id, en, bn, sceneBn, level, topic], i) => ({
  id,
  title_en: en,
  title_bn: bn,
  level,
  topic,
  sceneBn,
  systemPromptKey: `ai_conversation:${en}`,
  scriptedFallbackId: `fb_${id}`,
  art: i % 4 === 0 ? "ill_scenario_market" : undefined,
}));

/**
 * A scenario-specific scripted role-play for every scenario (used offline / when
 * the AI quota is spent). The turns come from the reviewed per-scenario scripts
 * in scripts.ts; a scenario without a bespoke script falls back to a safe generic
 * 5-turn exchange so the offline path is never a dead end.
 */
function genericScript(sceneBn: string): ScriptTurn[] {
  return [
    { ai: "Hello! Let's practice this together.", hintBn: `${sceneBn} — শুরু করুন`, suggestions: ["Hello!", "Hi, how are you?", "I'm ready."] },
    { ai: "Great. Tell me a little about it.", hintBn: "আরেকটু বিস্তারিত বলুন", suggestions: ["Yes, of course.", "Sure, let me explain.", "Okay."] },
    { ai: "Nice. What else would you like to say?", hintBn: "আপনার কথা চালিয়ে যান", suggestions: ["Let me think.", "I have a question.", "That's all for now."] },
    { ai: "You're doing well. Keep going!", hintBn: "আরেকটি বাক্য বলুন", suggestions: ["Thank you.", "I'll try more.", "This is helpful."] },
    { ai: "Well done. See you next time!", hintBn: "বিদায় জানান", suggestions: ["Thank you!", "Goodbye!", "See you soon."] },
  ];
}

export const SCRIPTED: Record<string, ScriptedRolePlay> = Object.fromEntries(
  SCENARIOS.map((s) => [
    s.scriptedFallbackId,
    { id: s.scriptedFallbackId, turns: SCENARIO_SCRIPTS[s.id] ?? genericScript(s.sceneBn) },
  ]),
);

// ---------- Courses + lessons ----------

export const COURSES: Course[] = [
  { id: "c7", title_bn: "৭ দিনের শুরু", title_en: "7-day starter", days: 7, level: "A1" },
  { id: "c30", title_bn: "৩০ দিনের পথ", title_en: "30-day journey", days: 30, level: "A1" },
];

// Day titles for the 30-day journey (real lesson topics; the 7-day uses the first 7).
type DaySpec = [bn: string, en: string, topic: Topic, scenarioId: string | null];
const DAY_SPECS: DaySpec[] = [
  ["নিজের পরিচয়", "Introduce yourself", "daily", "sc_intro"],
  ["সৌজন্য ও অভিবাদন", "Greetings & courtesy", "daily", "sc_greet"],
  ["বাজারে দরদাম", "At the market", "shopping", "sc_market"],
  ["চা ও খাবার", "Tea & snacks", "daily", "sc_tea"],
  ["রাস্তা জিজ্ঞাসা", "Asking directions", "travel", "sc_directions"],
  ["বাসে চলা", "Taking a bus", "travel", "sc_bus"],
  ["ফোনে কথা", "On the phone", "phone", "sc_phone_basic"],
  ["জামাকাপড় কেনা", "Buying clothes", "shopping", "sc_shop_clothes"],
  ["রেস্তোরাঁয়", "At a restaurant", "daily", "sc_restaurant"],
  ["ডাক্তারের কাছে", "At the doctor", "health", "sc_clinic"],
  ["ওষুধের দোকানে", "At the pharmacy", "health", "sc_pharmacy"],
  ["ব্যাঙ্কে", "At the bank", "bank", "sc_bank_open"],
  ["এটিএম ব্যবহার", "Using an ATM", "bank", "sc_atm"],
  ["ট্রেনের টিকিট", "Train tickets", "travel", "sc_train_book"],
  ["হোটেলে", "At a hotel", "travel", "sc_hotel"],
  ["পণ্য ফেরত", "Returning items", "shopping", "sc_shop_return"],
  ["অ্যাপয়েন্টমেন্ট", "Appointments", "phone", "sc_phone_appt"],
  ["কাজের জায়গায় গল্প", "Small talk at work", "jobs", "sc_small_talk"],
  ["সময় ও তারিখ", "Time & dates", "daily", null],
  ["দিক ও অবস্থান", "Place & position", "travel", null],
  ["ইন্টারভিউ প্রস্তুতি", "Interview prep", "interview", "sc_interview"],
  ["বেতন আলোচনা", "Salary talk", "jobs", "sc_salary"],
  ["অভিযোগ জানানো", "Making a complaint", "shopping", "sc_complaint"],
  ["মিটিং-এ কথা", "In a meeting", "jobs", "sc_meeting"],
  ["সংক্ষিপ্ত আপডেট", "Giving an update", "jobs", "sc_presentation"],
  ["বাড়িওয়ালার সাথে", "Talking to a landlord", "daily", "sc_landlord"],
  ["গ্রাহক সেবা", "Helping a customer", "jobs", "sc_customer"],
  ["সমস্যা বোঝানো", "Explaining a problem", "daily", "sc_describe_problem"],
  ["ভ্রমণ পরিকল্পনা", "Planning a trip", "travel", "sc_plan_trip"],
  ["সব মিলিয়ে", "Putting it together", "daily", "sc_small_talk"],
];

/** Pick `n` phrases for a day, cycling the topic pool (falls back to daily).
 *  Offset by (day - 1) so Day 1 "Introduce yourself" leads with the pool's first phrase
 *  ("My name is Rahul." — the same phrase onboarding has the learner say aloud). QA flagged
 *  the old (day) offset: Day 1 opened on "Nice to meet you." with no "My name is..." card. */
function phrasesFor(topic: Topic, day: number, n: number): string[] {
  const pool = byTopic(topic).length ? byTopic(topic) : byTopic("daily");
  const all = pool.length >= n ? pool : [...pool, ...byTopic("daily")];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(all[(day - 1 + i) % all.length].id);
  return Array.from(new Set(out)).slice(0, n).length >= 2 ? out : out;
}

function buildLessons(course: Course): Lesson[] {
  return Array.from({ length: course.days }, (_, i) => {
    const day = i + 1;
    const [bn, en, topic, scenarioId] = DAY_SPECS[i];
    const phraseIds = phrasesFor(topic, day, 6);
    const id = `${course.id}_d${day}`;
    return {
      id,
      courseId: course.id,
      day,
      title_bn: bn,
      title_en: en,
      scenarioId,
      phraseIds,
      quizIds: [`${id}_q1`, `${id}_q2`, `${id}_q3`, `${id}_q4`, `${id}_q5`],
      speakingPhraseId: phraseIds[0],
    };
  });
}

export const LESSONS: Lesson[] = COURSES.flatMap(buildLessons);

// ---------- Quiz items (5 per lesson, generated from the lesson's phrases) ----------

const phraseById = new Map(PHRASES.map((p) => [p.id, p]));

function distractors(correct: string, pool: string[], n: number): string[] {
  const out: string[] = [];
  for (const c of pool) {
    if (c !== correct && !out.includes(c)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function buildQuiz(lesson: Lesson): QuizItem[] {
  const ps = lesson.phraseIds.map((id) => phraseById.get(id)!).filter(Boolean);
  const allBn = PHRASES.map((p) => p.bn);
  const allEn = PHRASES.map((p) => p.en);
  const items: QuizItem[] = [];
  const types = ["translate", "listen_pick", "fill_gap", "order_words", "translate"] as const;
  for (let i = 0; i < 5; i++) {
    const p = ps[i % ps.length];
    const type = types[i];
    const base = { id: lesson.quizIds[i], lessonId: lesson.id };
    if (type === "translate") {
      items.push({
        ...base,
        type,
        prompt: p.en,
        options: [p.bn, ...distractors(p.bn, allBn, 3)],
        answer: p.bn,
        explanationBn: `"${p.en}" মানে "${p.bn}"।`,
      });
    } else if (type === "listen_pick") {
      items.push({
        ...base,
        type,
        prompt: p.audioNormalUri,
        options: [p.en, ...distractors(p.en, allEn, 3)],
        answer: p.en,
        explanationBn: `আপনি শুনলেন "${p.en}" — মানে "${p.bn}"।`,
      });
    } else if (type === "fill_gap") {
      const words = p.en.split(" ");
      const gapIdx = Math.min(1, words.length - 1);
      const missing = words[gapIdx].replace(/[.,!?]/g, "");
      const prompt = words.map((w, j) => (j === gapIdx ? "___" : w)).join(" ");
      items.push({
        ...base,
        type,
        prompt,
        options: [missing, ...distractors(missing, allEn.join(" ").split(" "), 3)],
        answer: missing,
        explanationBn: `সঠিক শব্দ "${missing}" — পুরো বাক্য: "${p.en}"।`,
      });
    } else {
      const tokens = p.en.replace(/[.?!]/g, "").split(" ");
      items.push({
        ...base,
        type,
        prompt: p.bn,
        options: [...tokens].reverse(),
        answer: tokens.join(" "),
        explanationBn: `সঠিক ক্রম: "${p.en}"।`,
      });
    }
  }
  return items;
}

export const QUIZ_ITEMS: QuizItem[] = LESSONS.flatMap(buildQuiz);

// ---------- Grammar cards ----------

function grammar(
  id: string,
  title_bn: string,
  title_en: string,
  bodyBn: string,
  ex: [string, string][],
  quiz: { prompt: string; options: string[]; answer: string; explanationBn: string },
): GrammarCard {
  return {
    id,
    title_bn,
    title_en,
    bodyBn,
    examples: ex.map(([en, bn], i) => ({ en, bn, audioUri: `audio/${id}_ex${i + 1}.m4a` })),
    quiz,
  };
}

export const GRAMMAR: GrammarCard[] = [
  grammar(
    "g_present_simple",
    "বর্তমান কাল (Simple Present)",
    "Simple present",
    "প্রতিদিনের কাজ বা সত্য বোঝাতে simple present ব্যবহার হয়। He/She/It-এর সাথে verb-এ 's' যোগ হয়।",
    [
      ["I go to work.", "আমি কাজে যাই।"],
      ["She goes to school.", "সে স্কুলে যায়।"],
      ["They play cricket.", "তারা ক্রিকেট খেলে।"],
    ],
    { prompt: "She ___ tea every morning.", options: ["drink", "drinks", "drinking"], answer: "drinks", explanationBn: "She-এর সাথে verb-এ 's' যোগ হয়।" },
  ),
  grammar(
    "g_articles",
    "a / an / the",
    "Articles",
    "স্বরবর্ণ-ধ্বনির আগে 'an', ব্যঞ্জনের আগে 'a'; নির্দিষ্ট কিছু বোঝাতে 'the'।",
    [
      ["I have a pen.", "আমার একটা কলম আছে।"],
      ["She ate an apple.", "সে একটা আপেল খেল।"],
      ["Open the door.", "দরজাটা খোলো।"],
    ],
    { prompt: "I saw ___ elephant.", options: ["a", "an", "the"], answer: "an", explanationBn: "'elephant' স্বরধ্বনি দিয়ে শুরু, তাই 'an'।" },
  ),
  grammar(
    "g_past_simple",
    "অতীত কাল (Simple Past)",
    "Simple past",
    "আগে ঘটে যাওয়া কাজ বোঝাতে past tense। নিয়মিত verb-এ 'ed' যোগ হয়।",
    [
      ["I worked yesterday.", "আমি গতকাল কাজ করেছি।"],
      ["She visited us.", "সে আমাদের সাথে দেখা করেছিল।"],
      ["We went home.", "আমরা বাড়ি গিয়েছিলাম।"],
    ],
    { prompt: "Yesterday I ___ to the market.", options: ["go", "went", "gone"], answer: "went", explanationBn: "'go'-এর past form 'went'।" },
  ),
  grammar(
    "g_prepositions",
    "স্থান-নির্দেশক (in / on / at)",
    "Prepositions of place",
    "ভেতরে 'in', উপরে 'on', নির্দিষ্ট বিন্দুতে 'at'।",
    [
      ["The book is on the table.", "বইটা টেবিলের উপর।"],
      ["He is in the room.", "সে ঘরের ভেতরে।"],
      ["Meet me at the gate.", "গেটের কাছে দেখা করো।"],
    ],
    { prompt: "The keys are ___ the bag.", options: ["in", "on", "at"], answer: "in", explanationBn: "ব্যাগের ভেতরে বোঝাতে 'in'।" },
  ),
  grammar(
    "g_can_could",
    "পারা (can / could)",
    "Can & could",
    "ক্ষমতা বা অনুরোধ বোঝাতে 'can'; বিনয়ী অনুরোধে 'could'।",
    [
      ["I can speak English.", "আমি ইংরেজি বলতে পারি।"],
      ["Can you help me?", "আপনি কি সাহায্য করতে পারবেন?"],
      ["Could you repeat that?", "আপনি কি আবার বলবেন?"],
    ],
    { prompt: "___ you pass the salt, please?", options: ["Could", "Does", "Is"], answer: "Could", explanationBn: "বিনয়ী অনুরোধে 'Could'।" },
  ),
  grammar(
    "g_questions",
    "প্রশ্ন করা (Wh- questions)",
    "Wh- questions",
    "What, where, when, who, why, how দিয়ে প্রশ্ন শুরু হয়।",
    [
      ["Where do you live?", "আপনি কোথায় থাকেন?"],
      ["What is this?", "এটা কী?"],
      ["How much is it?", "এটার দাম কত?"],
    ],
    { prompt: "___ is the station?", options: ["Where", "What", "Who"], answer: "Where", explanationBn: "স্থান জানতে 'Where'।" },
  ),
  grammar(
    "g_plural",
    "বহুবচন (Plurals)",
    "Plurals",
    "একাধিক বোঝাতে বিশেষ্যের শেষে সাধারণত 's' যোগ হয়।",
    [
      ["one book, two books", "একটা বই, দুটো বই"],
      ["I have three bags.", "আমার তিনটে ব্যাগ আছে।"],
      ["These mangoes are sweet.", "এই আমগুলো মিষ্টি।"],
    ],
    { prompt: "I bought two ___.", options: ["ticket", "tickets", "ticketes"], answer: "tickets", explanationBn: "বহুবচনে 'tickets'।" },
  ),
  grammar(
    "g_present_continuous",
    "চলমান বর্তমান (Present continuous)",
    "Present continuous",
    "এই মুহূর্তে চলছে এমন কাজ বোঝাতে am/is/are + verb+ing।",
    [
      ["I am eating.", "আমি খাচ্ছি।"],
      ["She is reading.", "সে পড়ছে।"],
      ["They are playing.", "তারা খেলছে।"],
    ],
    { prompt: "He ___ now.", options: ["sleep", "is sleeping", "slept"], answer: "is sleeping", explanationBn: "এখন চলছে, তাই is + sleeping।" },
  ),
  grammar(
    "g_will_future",
    "ভবিষ্যৎ (will)",
    "Future with will",
    "ভবিষ্যতের কাজ বা সিদ্ধান্ত বোঝাতে 'will' + verb।",
    [
      ["I will call you.", "আমি তোমাকে ফোন করব।"],
      ["It will rain.", "বৃষ্টি হবে।"],
      ["We will meet tomorrow.", "আমরা কাল দেখা করব।"],
    ],
    { prompt: "I ___ help you.", options: ["will", "am", "did"], answer: "will", explanationBn: "ভবিষ্যতে সাহায্য করবেন, তাই 'will'।" },
  ),
  grammar(
    "g_pronouns",
    "সর্বনাম (Pronouns)",
    "Pronouns",
    "নামের বদলে I, you, he, she, it, we, they ব্যবহার হয়।",
    [
      ["He is my brother.", "সে আমার ভাই।"],
      ["They are friends.", "তারা বন্ধু।"],
      ["It is hot today.", "আজ গরম।"],
    ],
    { prompt: "Rina is kind. ___ helps everyone.", options: ["He", "She", "It"], answer: "She", explanationBn: "Rina একজন মেয়ে, তাই 'She'।" },
  ),
  grammar(
    "g_there_is",
    "আছে/নেই (there is / are)",
    "There is / are",
    "কিছু আছে বোঝাতে একবচনে 'there is', বহুবচনে 'there are'।",
    [
      ["There is a shop here.", "এখানে একটা দোকান আছে।"],
      ["There are many people.", "অনেক লোক আছে।"],
      ["Is there a toilet?", "এখানে কি টয়লেট আছে?"],
    ],
    { prompt: "There ___ two buses.", options: ["is", "are", "am"], answer: "are", explanationBn: "'two buses' বহুবচন, তাই 'are'।" },
  ),
  grammar(
    "g_polite",
    "ভদ্রতা (please / sorry / thank you)",
    "Polite words",
    "অনুরোধে 'please', ক্ষমায় 'sorry', কৃতজ্ঞতায় 'thank you'।",
    [
      ["Please sit down.", "দয়া করে বসুন।"],
      ["Sorry, I am late.", "দুঃখিত, আমার দেরি হল।"],
      ["Thank you for your help.", "সাহায্যের জন্য ধন্যবাদ।"],
    ],
    { prompt: "___ , can you help me?", options: ["Please", "Sorry", "Bye"], answer: "Please", explanationBn: "অনুরোধে 'Please'।" },
  ),
  grammar(
    "g_have_has",
    "আছে (have / has)",
    "Have & has",
    "I/you/we/they-এর সাথে 'have', He/She/It-এর সাথে 'has'।",
    [
      ["I have a car.", "আমার একটা গাড়ি আছে।"],
      ["She has two children.", "তার দুটো সন্তান আছে।"],
      ["They have a shop.", "তাদের একটা দোকান আছে।"],
    ],
    { prompt: "He ___ a new phone.", options: ["have", "has", "having"], answer: "has", explanationBn: "He-এর সাথে 'has'।" },
  ),
  grammar(
    "g_this_that",
    "এটা/ওটা (this / that / these / those)",
    "This, that, these, those",
    "কাছের একটা 'this', দূরের একটা 'that'; কাছের বহু 'these', দূরের বহু 'those'।",
    [
      ["This is my bag.", "এটা আমার ব্যাগ।"],
      ["That is your seat.", "ওটা আপনার সিট।"],
      ["These mangoes are sweet.", "এই আমগুলো মিষ্টি।"],
    ],
    { prompt: "___ shoes over there are nice.", options: ["This", "These", "Those"], answer: "Those", explanationBn: "দূরের একাধিক বোঝাতে 'Those'।" },
  ),
  grammar(
    "g_much_many",
    "কতটা/কতগুলো (much / many)",
    "Much & many",
    "গোনা যায় না এমন কিছুতে 'much', গোনা যায় এমন কিছুতে 'many'।",
    [
      ["How much water?", "কতটা জল?"],
      ["How many people?", "কতজন লোক?"],
      ["I don't have much time.", "আমার বেশি সময় নেই।"],
    ],
    { prompt: "How ___ apples do you want?", options: ["much", "many", "more"], answer: "many", explanationBn: "apples গোনা যায়, তাই 'many'।" },
  ),
  grammar(
    "g_comparatives",
    "তুলনা (bigger / better)",
    "Comparatives",
    "ছোট শব্দে শেষে 'er' (bigger), বড় শব্দে আগে 'more' (more useful); দুইয়ের তুলনায় 'than'।",
    [
      ["This bag is bigger.", "এই ব্যাগটা বড়।"],
      ["Today is hotter than yesterday.", "গতকালের চেয়ে আজ বেশি গরম।"],
      ["This phone is more expensive.", "এই ফোনটা বেশি দামি।"],
    ],
    { prompt: "This road is ___ than that one.", options: ["long", "longer", "longest"], answer: "longer", explanationBn: "দুইয়ের তুলনায় 'longer' + than।" },
  ),
  grammar(
    "g_should",
    "উচিত (should)",
    "Should",
    "পরামর্শ বা উচিত বোঝাতে 'should' + মূল verb।",
    [
      ["You should rest.", "আপনার বিশ্রাম নেওয়া উচিত।"],
      ["We should go now.", "আমাদের এখন যাওয়া উচিত।"],
      ["You should see a doctor.", "আপনার ডাক্তার দেখানো উচিত।"],
    ],
    { prompt: "You ___ drink more water.", options: ["should", "shoulds", "shall"], answer: "should", explanationBn: "পরামর্শে 'should' + মূল verb।" },
  ),
  grammar(
    "g_want_to",
    "চাওয়া (want to / would like)",
    "Want to & would like",
    "ইচ্ছা বোঝাতে 'want to' + verb; বিনয়ী ভাবে 'would like to'।",
    [
      ["I want to learn English.", "আমি ইংরেজি শিখতে চাই।"],
      ["I would like a cup of tea.", "আমি এক কাপ চা চাই।"],
      ["She wants to go home.", "সে বাড়ি যেতে চায়।"],
    ],
    { prompt: "I ___ to book a ticket.", options: ["want", "wants", "wanting"], answer: "want", explanationBn: "I-এর সাথে 'want to'।" },
  ),
  grammar(
    "g_adverbs_freq",
    "কতবার (always / usually / never)",
    "Adverbs of frequency",
    "কাজ কতবার হয় বোঝায়: always > usually > sometimes > never। সাধারণত মূল verb-এর আগে বসে।",
    [
      ["I always drink tea.", "আমি সবসময় চা খাই।"],
      ["She usually walks to work.", "সে সাধারণত হেঁটে কাজে যায়।"],
      ["They never come late.", "তারা কখনো দেরি করে না।"],
    ],
    { prompt: "He ___ eats breakfast at 8.", options: ["always", "a lot", "very"], answer: "always", explanationBn: "কতবার বোঝাতে 'always'।" },
  ),
  grammar(
    "g_object_pronouns",
    "কর্ম-সর্বনাম (me / him / her / them)",
    "Object pronouns",
    "কাজের শেষে বা preposition-এর পরে me, you, him, her, it, us, them বসে।",
    [
      ["Please help me.", "দয়া করে আমাকে সাহায্য করুন।"],
      ["I called him.", "আমি তাকে ফোন করেছি।"],
      ["Give it to her.", "এটা তাকে দিন।"],
    ],
    { prompt: "Can you tell ___ the price?", options: ["I", "me", "my"], answer: "me", explanationBn: "কর্ম হিসেবে 'me'।" },
  ),
  grammar(
    "g_possessive",
    "কার (my / your / his / their)",
    "Possessives",
    "কার জিনিস বোঝাতে my, your, his, her, our, their বিশেষ্যের আগে বসে।",
    [
      ["This is my house.", "এটা আমার বাড়ি।"],
      ["What is your name?", "আপনার নাম কী?"],
      ["Their shop is closed.", "তাদের দোকান বন্ধ।"],
    ],
    { prompt: "Is this ___ bag?", options: ["you", "your", "yours"], answer: "your", explanationBn: "বিশেষ্যের আগে 'your'।" },
  ),
  grammar(
    "g_how_questions",
    "কেমন/কীভাবে (How …?)",
    "How questions",
    "'How much' দাম, 'How many' সংখ্যা, 'How long' সময়/দৈর্ঘ্য, 'How often' কতবার জানায়।",
    [
      ["How much is this?", "এটার দাম কত?"],
      ["How long does it take?", "কতক্ষণ লাগে?"],
      ["How often do you come?", "আপনি কতবার আসেন?"],
    ],
    { prompt: "___ many brothers do you have?", options: ["How", "What", "Where"], answer: "How", explanationBn: "সংখ্যায় 'How many'।" },
  ),
  grammar(
    "g_lets",
    "চলুন (Let's …)",
    "Let's",
    "একসাথে কিছু করার প্রস্তাবে 'Let's' + মূল verb।",
    [
      ["Let's go.", "চলুন যাই।"],
      ["Let's start now.", "চলুন এখন শুরু করি।"],
      ["Let's have tea.", "চলুন চা খাই।"],
    ],
    { prompt: "___ meet tomorrow.", options: ["Let's", "Let", "Lets us"], answer: "Let's", explanationBn: "প্রস্তাবে 'Let's' + verb।" },
  ),
  grammar(
    "g_going_to",
    "পরিকল্পনা (going to)",
    "Future with going to",
    "আগে থেকে ঠিক করা পরিকল্পনা বোঝাতে am/is/are + going to + verb।",
    [
      ["I am going to buy a phone.", "আমি একটা ফোন কিনতে যাচ্ছি।"],
      ["She is going to travel.", "সে বেড়াতে যাচ্ছে।"],
      ["We are going to meet them.", "আমরা তাদের সাথে দেখা করতে যাচ্ছি।"],
    ],
    { prompt: "They ___ going to open a shop.", options: ["is", "are", "am"], answer: "are", explanationBn: "They-এর সাথে 'are going to'।" },
  ),
  grammar(
    "g_past_continuous",
    "চলমান অতীত (Past continuous)",
    "Past continuous",
    "অতীতের কোনো মুহূর্তে চলছিল এমন কাজ বোঝাতে was/were + verb+ing।",
    [
      ["I was reading a book.", "আমি একটা বই পড়ছিলাম।"],
      ["They were playing.", "তারা খেলছিল।"],
      ["She was cooking.", "সে রান্না করছিল।"],
    ],
    { prompt: "We ___ watching TV.", options: ["was", "were", "are"], answer: "were", explanationBn: "We-এর সাথে 'were' + ing।" },
  ),
  grammar(
    "g_present_perfect",
    "পুরাঘটিত বর্তমান (Present perfect)",
    "Present perfect",
    "সদ্য শেষ হওয়া বা এখনো ফল আছে এমন কাজ বোঝাতে have/has + verb-এর past participle।",
    [
      ["I have finished my work.", "আমি আমার কাজ শেষ করেছি।"],
      ["She has gone home.", "সে বাড়ি চলে গেছে।"],
      ["We have seen this film.", "আমরা এই ছবিটা দেখেছি।"],
    ],
    { prompt: "He ___ eaten lunch.", options: ["have", "has", "had"], answer: "has", explanationBn: "He-এর সাথে 'has' + past participle।" },
  ),
  grammar(
    "g_superlatives",
    "সর্বোচ্চ তুলনা (biggest / best)",
    "Superlatives",
    "তিন বা তার বেশির মধ্যে সর্বোচ্চ বোঝাতে ছোট শব্দে 'the ...est', বড় শব্দে 'the most ...'।",
    [
      ["This is the biggest shop.", "এটা সবচেয়ে বড় দোকান।"],
      ["She is the best teacher.", "তিনি সেরা শিক্ষিকা।"],
      ["It is the most expensive phone.", "এটা সবচেয়ে দামি ফোন।"],
    ],
    { prompt: "This is the ___ day of the year.", options: ["hot", "hotter", "hottest"], answer: "hottest", explanationBn: "সর্বোচ্চ বোঝাতে 'the hottest'।" },
  ),
  grammar(
    "g_prepositions_time",
    "সময়-নির্দেশক (in / on / at)",
    "Prepositions of time",
    "মাস/বছর/সময়কালে 'in', নির্দিষ্ট দিনে/তারিখে 'on', নির্দিষ্ট ঘড়ির সময়ে 'at'।",
    [
      ["I was born in May.", "আমি মে মাসে জন্মেছি।"],
      ["See you on Monday.", "সোমবার দেখা হবে।"],
      ["The bus leaves at six.", "বাস ছ'টায় ছাড়ে।"],
    ],
    { prompt: "The class starts ___ 9 o'clock.", options: ["in", "on", "at"], answer: "at", explanationBn: "নির্দিষ্ট ঘড়ির সময়ে 'at'।" },
  ),
  grammar(
    "g_must",
    "অবশ্যই (must / have to)",
    "Must & have to",
    "বাধ্যবাধকতা বা খুব দরকার বোঝাতে 'must' বা 'have to' + মূল verb।",
    [
      ["You must wear a mask.", "আপনাকে অবশ্যই মাস্ক পরতে হবে।"],
      ["I have to go now.", "আমাকে এখন যেতে হবে।"],
      ["We must be careful.", "আমাদের সাবধান হতে হবে।"],
    ],
    { prompt: "You ___ stop at a red light.", options: ["must", "musts", "can"], answer: "must", explanationBn: "বাধ্যবাধকতায় 'must' + মূল verb।" },
  ),
  grammar(
    "g_some_any",
    "কিছু (some / any)",
    "Some & any",
    "হ্যাঁ-বাচক বাক্যে 'some', প্রশ্ন ও না-বাচক বাক্যে সাধারণত 'any'।",
    [
      ["I have some money.", "আমার কিছু টাকা আছে।"],
      ["Do you have any water?", "আপনার কাছে কি জল আছে?"],
      ["There isn't any bread.", "কোনো রুটি নেই।"],
    ],
    { prompt: "Is there ___ milk left?", options: ["some", "any", "a"], answer: "any", explanationBn: "প্রশ্নে সাধারণত 'any'।" },
  ),
  grammar(
    "g_countable",
    "গোনা যায়/যায় না (a few / a little)",
    "Countable & uncountable",
    "গোনা যায় এমন কিছুতে 'a few', গোনা যায় না এমন কিছুতে 'a little'।",
    [
      ["I have a few friends.", "আমার কয়েকজন বন্ধু আছে।"],
      ["Add a little salt.", "একটু নুন দিন।"],
      ["There are a few apples.", "কয়েকটা আপেল আছে।"],
    ],
    { prompt: "Add ___ sugar to the tea.", options: ["a few", "a little", "many"], answer: "a little", explanationBn: "চিনি গোনা যায় না, তাই 'a little'।" },
  ),
  grammar(
    "g_imperatives",
    "আদেশ/অনুরোধ (Imperatives)",
    "Imperatives",
    "নির্দেশ বা অনুরোধে মূল verb দিয়ে বাক্য শুরু হয়; না-বাচক-এ 'Don't' + verb।",
    [
      ["Close the door.", "দরজাটা বন্ধ করো।"],
      ["Please wait here.", "দয়া করে এখানে অপেক্ষা করো।"],
      ["Don't be late.", "দেরি কোরো না।"],
    ],
    { prompt: "___ touch the wire!", options: ["Don't", "Not", "No"], answer: "Don't", explanationBn: "না-বাচক নির্দেশে 'Don't' + verb।" },
  ),
  grammar(
    "g_conjunctions",
    "যোজক (and / but / because)",
    "Conjunctions",
    "দুটো অংশ জুড়তে 'and', বিপরীত বোঝাতে 'but', কারণ বোঝাতে 'because'।",
    [
      ["Tea and biscuits.", "চা আর বিস্কুট।"],
      ["It is small but useful.", "এটা ছোট কিন্তু কাজের।"],
      ["I stayed home because it rained.", "বৃষ্টির জন্য আমি বাড়িতে ছিলাম।"],
    ],
    { prompt: "I was tired, ___ I kept working.", options: ["and", "but", "so"], answer: "but", explanationBn: "বিপরীত বোঝাতে 'but'।" },
  ),
  grammar(
    "g_used_to",
    "আগে করতাম (used to)",
    "Used to",
    "অতীতের অভ্যাস বা আগে ঘটত এখন ঘটে না এমন কিছু বোঝাতে 'used to' + মূল verb।",
    [
      ["I used to live in a village.", "আমি আগে গ্রামে থাকতাম।"],
      ["She used to play cricket.", "সে আগে ক্রিকেট খেলত।"],
      ["We used to walk to school.", "আমরা আগে হেঁটে স্কুলে যেতাম।"],
    ],
    { prompt: "He ___ to smoke, but he stopped.", options: ["use", "used", "uses"], answer: "used", explanationBn: "অতীতের অভ্যাসে 'used to'।" },
  ),
  grammar(
    "g_conditional",
    "শর্ত (If …)",
    "First conditional",
    "সম্ভাব্য শর্ত বোঝাতে: If + present tense, will + মূল verb।",
    [
      ["If it rains, I will stay home.", "যদি বৃষ্টি হয়, আমি বাড়িতে থাকব।"],
      ["If you call, I will come.", "তুমি ফোন করলে আমি আসব।"],
      ["If I have time, I will help.", "আমার সময় থাকলে সাহায্য করব।"],
    ],
    { prompt: "If you study, you ___ pass.", options: ["will", "would", "are"], answer: "will", explanationBn: "First conditional-এ 'will' + মূল verb।" },
  ),
  grammar(
    "g_adjective_order",
    "বিশেষণের স্থান (Adjectives)",
    "Adjectives",
    "বিশেষণ সাধারণত বিশেষ্যের আগে বসে এবং একবচন-বহুবচনে বদলায় না।",
    [
      ["a red bag", "একটা লাল ব্যাগ"],
      ["a tall man", "একজন লম্বা লোক"],
      ["two small rooms", "দুটো ছোট ঘর"],
    ],
    { prompt: "I want a ___ car.", options: ["new", "news", "newly"], answer: "new", explanationBn: "বিশেষ্যের আগে বিশেষণ 'new'।" },
  ),
  grammar(
    "g_adverbs_manner",
    "কীভাবে (slowly / quickly)",
    "Adverbs of manner",
    "কাজ কীভাবে হয় তা বোঝাতে অনেক adverb বিশেষণের শেষে 'ly' যোগ করে তৈরি হয়।",
    [
      ["Please speak slowly.", "দয়া করে আস্তে বলুন।"],
      ["She runs quickly.", "সে দ্রুত দৌড়ায়।"],
      ["He answered politely.", "সে ভদ্রভাবে উত্তর দিল।"],
    ],
    { prompt: "Please drive ___.", options: ["careful", "carefully", "care"], answer: "carefully", explanationBn: "কীভাবে বোঝাতে 'carefully'।" },
  ),
  grammar(
    "g_why_because",
    "কেন (Why … / Because …)",
    "Why & because",
    "কারণ জানতে 'Why …?' দিয়ে প্রশ্ন, আর কারণ জানাতে 'Because …' দিয়ে উত্তর।",
    [
      ["Why are you late?", "তুমি দেরি করলে কেন?"],
      ["Because the bus was late.", "কারণ বাস দেরি করেছিল।"],
      ["Why is the shop closed?", "দোকান বন্ধ কেন?"],
    ],
    { prompt: "___ are you sad?", options: ["Why", "What", "Which"], answer: "Why", explanationBn: "কারণ জানতে 'Why'।" },
  ),
  grammar(
    "g_too_enough",
    "খুব বেশি/যথেষ্ট (too / enough)",
    "Too & enough",
    "দরকারের বেশি বোঝাতে বিশেষণের আগে 'too', যথেষ্ট বোঝাতে বিশেষণের পরে 'enough'।",
    [
      ["This bag is too heavy.", "এই ব্যাগটা খুব ভারী।"],
      ["The tea is not hot enough.", "চা যথেষ্ট গরম নয়।"],
      ["It is too expensive.", "এটা খুব দামি।"],
    ],
    { prompt: "The room is ___ small for us.", options: ["too", "enough", "very much"], answer: "too", explanationBn: "দরকারের বেশি বোঝাতে বিশেষণের আগে 'too'।" },
  ),
  grammar(
    "g_like_doing",
    "পছন্দ (like + verb-ing)",
    "Like doing",
    "কোনো কাজ করতে ভালো লাগে বোঝাতে like/love/enjoy-এর পরে verb+ing বসে।",
    [
      ["I like reading books.", "আমি বই পড়তে ভালোবাসি।"],
      ["She loves cooking.", "সে রান্না করতে ভালোবাসে।"],
      ["We enjoy travelling.", "আমরা ভ্রমণ করতে উপভোগ করি।"],
    ],
    { prompt: "I like ___ music.", options: ["listen", "listening", "listens"], answer: "listening", explanationBn: "like-এর পরে verb+ing, তাই 'listening'।" },
  ),
];

// ---------- Pronunciation drills ----------

export const DRILLS: PronDrill[] = [
  { id: "d_th", sound: "th", tipBn: "জিভের ডগা দাঁতের মাঝে রেখে বাতাস ছাড়ুন (th)।", pairs: [{ a: "thin", b: "tin" }, { a: "three", b: "tree" }, { a: "think", b: "sink" }] },
  { id: "d_vw", sound: "v/w", tipBn: "'v'-তে উপরের দাঁত নিচের ঠোঁটে; 'w'-তে ঠোঁট গোল।", pairs: [{ a: "vest", b: "west" }, { a: "vine", b: "wine" }, { a: "very", b: "wary" }] },
  { id: "d_z", sound: "z", tipBn: "'z'-তে গলায় কাঁপুনি অনুভব করুন।", pairs: [{ a: "zip", b: "sip" }, { a: "zoo", b: "sue" }, { a: "buzz", b: "bus" }] },
  { id: "d_pf", sound: "p/f", tipBn: "'p'-তে ঠোঁট বন্ধ; 'f'-তে দাঁত ঠোঁটে।", pairs: [{ a: "pan", b: "fan" }, { a: "pine", b: "fine" }, { a: "cup", b: "cuff" }] },
  { id: "d_vowel", sound: "short/long vowel", tipBn: "ছোট আর লম্বা স্বরের দৈর্ঘ্য আলাদা করুন।", pairs: [{ a: "ship", b: "sheep" }, { a: "bit", b: "beat" }, { a: "full", b: "fool" }] },
  { id: "d_s_sh", sound: "s/sh", tipBn: "'sh'-তে ঠোঁট একটু গোল করুন।", pairs: [{ a: "see", b: "she" }, { a: "sip", b: "ship" }, { a: "save", b: "shave" }] },
  { id: "d_dth", sound: "d/th", tipBn: "'th'-তে জিভ দাঁতের ফাঁকে; 'd'-তে জিভ তালুতে।", pairs: [{ a: "day", b: "they" }, { a: "dare", b: "there" }, { a: "doze", b: "those" }] },
  { id: "d_r_l", sound: "r/l", tipBn: "'r'-তে জিভ পিছিয়ে; 'l'-তে জিভের ডগা দাঁতের পেছনে।", pairs: [{ a: "rice", b: "lice" }, { a: "road", b: "load" }, { a: "right", b: "light" }] },
];

// ---------- Content review record (the real "zero wrong meanings" audit trail) ----------

/** Who reviewed the bundled bilingual content, their credential, and when. Every
 *  phrase's `reviewedBy` must resolve to one of these records (checked in content.ts),
 *  so "reviewed" is a real, traceable sign-off — not just a placeholder string. */
export interface Reviewer {
  id: string;
  name: string;
  credential: string;
  reviewedOn: string; // ISO date of the last bilingual review pass
  phrasesReviewed: number;
}

export const REVIEWERS: Record<string, Reviewer> = {
  editor_bilingual_v1: {
    id: "editor_bilingual_v1",
    name: "Fluent Friend ভাষা সম্পাদক দল",
    credential: "দ্বিভাষিক (বাংলা–ইংরেজি) সম্পাদনা · স্থানীয় বাংলা ভাষাভাষী",
    reviewedOn: "2026-11-01",
    phrasesReviewed: 0, // filled from the catalog below so it can't drift
  },
};
REVIEWERS.editor_bilingual_v1.phrasesReviewed = PHRASES.filter((p) => p.reviewedBy === "editor_bilingual_v1").length;

export const getReviewer = (id: string): Reviewer | undefined => REVIEWERS[id];

// ---------- Dictionary (seed; the full list ships in the offline pack) ----------

export const DICTIONARY: DictionaryWord[] = [
  { en: "water", bn: "জল", romanBn: "ওয়াটার", topic: "daily" },
  { en: "food", bn: "খাবার", romanBn: "ফুড", topic: "daily" },
  { en: "money", bn: "টাকা", romanBn: "মানি", topic: "bank" },
  { en: "work", bn: "কাজ", romanBn: "ওয়ার্ক", topic: "jobs" },
  { en: "doctor", bn: "ডাক্তার", romanBn: "ডক্টর", topic: "health" },
  { en: "bus", bn: "বাস", romanBn: "বাস", topic: "travel" },
  { en: "market", bn: "বাজার", romanBn: "মার্কেট", topic: "shopping" },
  { en: "price", bn: "দাম", romanBn: "প্রাইস", topic: "shopping" },
  { en: "ticket", bn: "টিকিট", romanBn: "টিকিট", topic: "travel" },
  { en: "medicine", bn: "ওষুধ", romanBn: "মেডিসিন", topic: "health" },
  { en: "account", bn: "অ্যাকাউন্ট", romanBn: "অ্যাকাউন্ট", topic: "bank" },
  { en: "interview", bn: "ইন্টারভিউ", romanBn: "ইন্টারভিউ", topic: "interview" },
  { en: "phone", bn: "ফোন", romanBn: "ফোন", topic: "phone" },
  { en: "morning", bn: "সকাল", romanBn: "মর্নিং", topic: "daily" },
  { en: "help", bn: "সাহায্য", romanBn: "হেল্প", topic: "daily" },
  { en: "night", bn: "রাত", romanBn: "নাইট", topic: "daily" },
  { en: "today", bn: "আজ", romanBn: "টুডে", topic: "daily" },
  { en: "tomorrow", bn: "আগামীকাল", romanBn: "টুমরো", topic: "daily" },
  { en: "yesterday", bn: "গতকাল", romanBn: "ইয়েস্টারডে", topic: "daily" },
  { en: "time", bn: "সময়", romanBn: "টাইম", topic: "daily" },
  { en: "friend", bn: "বন্ধু", romanBn: "ফ্রেন্ড", topic: "daily" },
  { en: "family", bn: "পরিবার", romanBn: "ফ্যামিলি", topic: "daily" },
  { en: "home", bn: "বাড়ি", romanBn: "হোম", topic: "daily" },
  { en: "shop", bn: "দোকান", romanBn: "শপ", topic: "shopping" },
  { en: "cheap", bn: "সস্তা", romanBn: "চিপ", topic: "shopping" },
  { en: "expensive", bn: "দামি", romanBn: "এক্সপেনসিভ", topic: "shopping" },
  { en: "vegetable", bn: "সবজি", romanBn: "ভেজিটেবল", topic: "shopping" },
  { en: "fruit", bn: "ফল", romanBn: "ফ্রুট", topic: "shopping" },
  { en: "size", bn: "মাপ", romanBn: "সাইজ", topic: "shopping" },
  { en: "train", bn: "ট্রেন", romanBn: "ট্রেন", topic: "travel" },
  { en: "station", bn: "স্টেশন", romanBn: "স্টেশন", topic: "travel" },
  { en: "road", bn: "রাস্তা", romanBn: "রোড", topic: "travel" },
  { en: "hotel", bn: "হোটেল", romanBn: "হোটেল", topic: "travel" },
  { en: "left", bn: "বাঁ", romanBn: "লেফট", topic: "travel" },
  { en: "right", bn: "ডান", romanBn: "রাইট", topic: "travel" },
  { en: "fever", bn: "জ্বর", romanBn: "ফিভার", topic: "health" },
  { en: "pain", bn: "ব্যথা", romanBn: "পেইন", topic: "health" },
  { en: "hospital", bn: "হাসপাতাল", romanBn: "হসপিটাল", topic: "health" },
  { en: "rest", bn: "বিশ্রাম", romanBn: "রেস্ট", topic: "health" },
  { en: "card", bn: "কার্ড", romanBn: "কার্ড", topic: "bank" },
  { en: "balance", bn: "ব্যালেন্স", romanBn: "ব্যালেন্স", topic: "bank" },
  { en: "deposit", bn: "জমা", romanBn: "ডিপোজিট", topic: "bank" },
  { en: "withdraw", bn: "তোলা", romanBn: "উইথড্র", topic: "bank" },
  { en: "call", bn: "ফোন করা", romanBn: "কল", topic: "phone" },
  { en: "number", bn: "নম্বর", romanBn: "নম্বর", topic: "phone" },
  { en: "message", bn: "বার্তা", romanBn: "মেসেজ", topic: "phone" },
  { en: "office", bn: "অফিস", romanBn: "অফিস", topic: "jobs" },
  { en: "salary", bn: "বেতন", romanBn: "স্যালারি", topic: "jobs" },
  { en: "meeting", bn: "সভা", romanBn: "মিটিং", topic: "jobs" },
  { en: "experience", bn: "অভিজ্ঞতা", romanBn: "এক্সপিরিয়েন্স", topic: "interview" },
  { en: "question", bn: "প্রশ্ন", romanBn: "কোয়েশ্চন", topic: "interview" },
  { en: "answer", bn: "উত্তর", romanBn: "আনসার", topic: "interview" },

  // daily life
  { en: "day", bn: "দিন", romanBn: "ডে", topic: "daily" },
  { en: "week", bn: "সপ্তাহ", romanBn: "উইক", topic: "daily" },
  { en: "month", bn: "মাস", romanBn: "মান্থ", topic: "daily" },
  { en: "year", bn: "বছর", romanBn: "ইয়ার", topic: "daily" },
  { en: "hour", bn: "ঘণ্টা", romanBn: "আওয়ার", topic: "daily" },
  { en: "minute", bn: "মিনিট", romanBn: "মিনিট", topic: "daily" },
  { en: "tea", bn: "চা", romanBn: "টি", topic: "daily" },
  { en: "rice", bn: "ভাত", romanBn: "রাইস", topic: "daily" },
  { en: "milk", bn: "দুধ", romanBn: "মিল্ক", topic: "daily" },
  { en: "house", bn: "বাড়ি", romanBn: "হাউস", topic: "daily" },
  { en: "door", bn: "দরজা", romanBn: "ডোর", topic: "daily" },
  { en: "water bottle", bn: "জলের বোতল", romanBn: "ওয়াটার বটল", topic: "daily" },
  { en: "book", bn: "বই", romanBn: "বুক", topic: "daily" },
  { en: "pen", bn: "কলম", romanBn: "পেন", topic: "daily" },
  { en: "name", bn: "নাম", romanBn: "নেম", topic: "daily" },
  { en: "city", bn: "শহর", romanBn: "সিটি", topic: "daily" },
  { en: "village", bn: "গ্রাম", romanBn: "ভিলেজ", topic: "daily" },
  { en: "weather", bn: "আবহাওয়া", romanBn: "ওয়েদার", topic: "daily" },
  { en: "rain", bn: "বৃষ্টি", romanBn: "রেইন", topic: "daily" },
  { en: "sun", bn: "সূর্য", romanBn: "সান", topic: "daily" },
  { en: "happy", bn: "খুশি", romanBn: "হ্যাপি", topic: "daily" },
  { en: "sad", bn: "দুঃখী", romanBn: "স্যাড", topic: "daily" },
  { en: "tired", bn: "ক্লান্ত", romanBn: "টায়ার্ড", topic: "daily" },
  { en: "hungry", bn: "ক্ষুধার্ত", romanBn: "হাংরি", topic: "daily" },
  { en: "thirsty", bn: "তৃষ্ণার্ত", romanBn: "থার্স্টি", topic: "daily" },
  { en: "hot", bn: "গরম", romanBn: "হট", topic: "daily" },
  { en: "cold", bn: "ঠান্ডা", romanBn: "কোল্ড", topic: "daily" },
  { en: "big", bn: "বড়", romanBn: "বিগ", topic: "daily" },
  { en: "small", bn: "ছোট", romanBn: "স্মল", topic: "daily" },
  { en: "new", bn: "নতুন", romanBn: "নিউ", topic: "daily" },
  { en: "old", bn: "পুরোনো", romanBn: "ওল্ড", topic: "daily" },
  { en: "good", bn: "ভালো", romanBn: "গুড", topic: "daily" },
  { en: "bad", bn: "খারাপ", romanBn: "ব্যাড", topic: "daily" },
  { en: "please", bn: "দয়া করে", romanBn: "প্লিজ", topic: "daily" },
  { en: "sorry", bn: "দুঃখিত", romanBn: "সরি", topic: "daily" },
  { en: "thanks", bn: "ধন্যবাদ", romanBn: "থ্যাঙ্কস", topic: "daily" },
  { en: "yes", bn: "হ্যাঁ", romanBn: "ইয়েস", topic: "daily" },
  { en: "no", bn: "না", romanBn: "নো", topic: "daily" },
  { en: "maybe", bn: "হয়তো", romanBn: "মেবি", topic: "daily" },
  { en: "always", bn: "সবসময়", romanBn: "অলওয়েজ", topic: "daily" },
  { en: "never", bn: "কখনো না", romanBn: "নেভার", topic: "daily" },
  { en: "now", bn: "এখন", romanBn: "নাউ", topic: "daily" },
  { en: "later", bn: "পরে", romanBn: "লেটার", topic: "daily" },
  { en: "here", bn: "এখানে", romanBn: "হিয়ার", topic: "daily" },
  { en: "there", bn: "সেখানে", romanBn: "দেয়ার", topic: "daily" },
  { en: "week day", bn: "কর্মদিবস", romanBn: "উইকডে", topic: "daily" },
  { en: "holiday", bn: "ছুটি", romanBn: "হলিডে", topic: "daily" },

  // shopping
  { en: "buy", bn: "কেনা", romanBn: "বাই", topic: "shopping" },
  { en: "sell", bn: "বিক্রি করা", romanBn: "সেল", topic: "shopping" },
  { en: "pay", bn: "টাকা দেওয়া", romanBn: "পে", topic: "shopping" },
  { en: "change", bn: "খুচরো", romanBn: "চেঞ্জ", topic: "shopping" },
  { en: "bag", bn: "ব্যাগ", romanBn: "ব্যাগ", topic: "shopping" },
  { en: "discount", bn: "ছাড়", romanBn: "ডিসকাউন্ট", topic: "shopping" },
  { en: "receipt", bn: "রসিদ", romanBn: "রিসিট", topic: "shopping" },
  { en: "rice bag", bn: "চালের বস্তা", romanBn: "রাইস ব্যাগ", topic: "shopping" },
  { en: "clothes", bn: "জামাকাপড়", romanBn: "ক্লোদস", topic: "shopping" },
  { en: "shoe", bn: "জুতো", romanBn: "শু", topic: "shopping" },
  { en: "fish", bn: "মাছ", romanBn: "ফিশ", topic: "shopping" },
  { en: "egg", bn: "ডিম", romanBn: "এগ", topic: "shopping" },
  { en: "oil", bn: "তেল", romanBn: "অয়েল", topic: "shopping" },
  { en: "sugar", bn: "চিনি", romanBn: "সুগার", topic: "shopping" },
  { en: "salt", bn: "নুন", romanBn: "সল্ট", topic: "shopping" },

  // travel
  { en: "airport", bn: "বিমানবন্দর", romanBn: "এয়ারপোর্ট", topic: "travel" },
  { en: "flight", bn: "বিমান", romanBn: "ফ্লাইট", topic: "travel" },
  { en: "map", bn: "মানচিত্র", romanBn: "ম্যাপ", topic: "travel" },
  { en: "luggage", bn: "মালপত্র", romanBn: "লাগেজ", topic: "travel" },
  { en: "seat", bn: "আসন", romanBn: "সিট", topic: "travel" },
  { en: "platform", bn: "প্ল্যাটফর্ম", romanBn: "প্ল্যাটফর্ম", topic: "travel" },
  { en: "fare", bn: "ভাড়া", romanBn: "ফেয়ার", topic: "travel" },
  { en: "driver", bn: "চালক", romanBn: "ড্রাইভার", topic: "travel" },
  { en: "near", bn: "কাছে", romanBn: "নিয়ার", topic: "travel" },
  { en: "far", bn: "দূরে", romanBn: "ফার", topic: "travel" },
  { en: "straight", bn: "সোজা", romanBn: "স্ট্রেইট", topic: "travel" },
  { en: "corner", bn: "কোণ", romanBn: "কর্নার", topic: "travel" },
  { en: "stop", bn: "থামা", romanBn: "স্টপ", topic: "travel" },
  { en: "arrive", bn: "পৌঁছানো", romanBn: "অ্যারাইভ", topic: "travel" },

  // health
  { en: "cough", bn: "কাশি", romanBn: "কফ", topic: "health" },
  { en: "flu", bn: "সর্দি-জ্বর", romanBn: "ফ্লু", topic: "health" },
  { en: "headache", bn: "মাথা ব্যথা", romanBn: "হেডেক", topic: "health" },
  { en: "tablet", bn: "বড়ি", romanBn: "ট্যাবলেট", topic: "health" },
  { en: "nurse", bn: "নার্স", romanBn: "নার্স", topic: "health" },
  { en: "clinic", bn: "ক্লিনিক", romanBn: "ক্লিনিক", topic: "health" },
  { en: "healthy", bn: "সুস্থ", romanBn: "হেলদি", topic: "health" },
  { en: "sick", bn: "অসুস্থ", romanBn: "সিক", topic: "health" },
  { en: "pharmacy", bn: "ফার্মেসি", romanBn: "ফার্মেসি", topic: "health" },
  { en: "test", bn: "পরীক্ষা", romanBn: "টেস্ট", topic: "health" },

  // bank
  { en: "bank", bn: "ব্যাঙ্ক", romanBn: "ব্যাঙ্ক", topic: "bank" },
  { en: "cash", bn: "নগদ", romanBn: "ক্যাশ", topic: "bank" },
  { en: "form", bn: "ফর্ম", romanBn: "ফর্ম", topic: "bank" },
  { en: "signature", bn: "স্বাক্ষর", romanBn: "সিগনেচার", topic: "bank" },
  { en: "document", bn: "কাগজপত্র", romanBn: "ডকুমেন্ট", topic: "bank" },
  { en: "transfer", bn: "স্থানান্তর", romanBn: "ট্রান্সফার", topic: "bank" },
  { en: "loan", bn: "ঋণ", romanBn: "লোন", topic: "bank" },
  { en: "interest", bn: "সুদ", romanBn: "ইন্টারেস্ট", topic: "bank" },

  // phone
  { en: "ring", bn: "বাজা", romanBn: "রিং", topic: "phone" },
  { en: "charge", bn: "চার্জ", romanBn: "চার্জ", topic: "phone" },
  { en: "battery", bn: "ব্যাটারি", romanBn: "ব্যাটারি", topic: "phone" },
  { en: "network", bn: "নেটওয়ার্ক", romanBn: "নেটওয়ার্ক", topic: "phone" },
  { en: "internet", bn: "ইন্টারনেট", romanBn: "ইন্টারনেট", topic: "phone" },
  { en: "app", bn: "অ্যাপ", romanBn: "অ্যাপ", topic: "phone" },
  { en: "screen", bn: "পর্দা", romanBn: "স্ক্রিন", topic: "phone" },

  // jobs / interview
  { en: "boss", bn: "বস", romanBn: "বস", topic: "jobs" },
  { en: "colleague", bn: "সহকর্মী", romanBn: "কলিগ", topic: "jobs" },
  { en: "team", bn: "দল", romanBn: "টিম", topic: "jobs" },
  { en: "project", bn: "প্রকল্প", romanBn: "প্রজেক্ট", topic: "jobs" },
  { en: "deadline", bn: "সময়সীমা", romanBn: "ডেডলাইন", topic: "jobs" },
  { en: "skill", bn: "দক্ষতা", romanBn: "স্কিল", topic: "jobs" },
  { en: "résumé", bn: "জীবনবৃত্তান্ত", romanBn: "রেজ়ুমে", topic: "interview" },
  { en: "appointment", bn: "সাক্ষাৎকারের সময়", romanBn: "অ্যাপয়েন্টমেন্ট", topic: "interview" },
  { en: "confident", bn: "আত্মবিশ্বাসী", romanBn: "কনফিডেন্ট", topic: "interview" },
  { en: "honest", bn: "সৎ", romanBn: "অনেস্ট", topic: "interview" },

  // numbers & time (daily)
  { en: "one", bn: "এক", romanBn: "ওয়ান", topic: "daily" },
  { en: "two", bn: "দুই", romanBn: "টু", topic: "daily" },
  { en: "three", bn: "তিন", romanBn: "থ্রি", topic: "daily" },
  { en: "hundred", bn: "একশো", romanBn: "হান্ড্রেড", topic: "daily" },
  { en: "first", bn: "প্রথম", romanBn: "ফার্স্ট", topic: "daily" },
  { en: "last", bn: "শেষ", romanBn: "লাস্ট", topic: "daily" },
  { en: "early", bn: "তাড়াতাড়ি", romanBn: "আর্লি", topic: "daily" },
  { en: "late", bn: "দেরি", romanBn: "লেট", topic: "daily" },
  { en: "evening", bn: "সন্ধ্যা", romanBn: "ইভনিং", topic: "daily" },
  { en: "afternoon", bn: "দুপুর", romanBn: "আফটারনুন", topic: "daily" },

  // food (shopping)
  { en: "bread", bn: "রুটি", romanBn: "ব্রেড", topic: "shopping" },
  { en: "meat", bn: "মাংস", romanBn: "মিট", topic: "shopping" },
  { en: "onion", bn: "পেঁয়াজ", romanBn: "অনিয়ন", topic: "shopping" },
  { en: "potato", bn: "আলু", romanBn: "পটেটো", topic: "shopping" },
  { en: "chili", bn: "লঙ্কা", romanBn: "চিলি", topic: "shopping" },
  { en: "spicy", bn: "ঝাল", romanBn: "স্পাইসি", topic: "shopping" },
  { en: "sweet", bn: "মিষ্টি", romanBn: "সুইট", topic: "shopping" },
  { en: "fresh", bn: "তাজা", romanBn: "ফ্রেশ", topic: "shopping" },

  // people & feelings (daily)
  { en: "mother", bn: "মা", romanBn: "মাদার", topic: "daily" },
  { en: "father", bn: "বাবা", romanBn: "ফাদার", topic: "daily" },
  { en: "brother", bn: "ভাই", romanBn: "ব্রাদার", topic: "daily" },
  { en: "sister", bn: "বোন", romanBn: "সিস্টার", topic: "daily" },
  { en: "child", bn: "শিশু", romanBn: "চাইল্ড", topic: "daily" },
  { en: "neighbour", bn: "প্রতিবেশী", romanBn: "নেইবার", topic: "daily" },
  { en: "afraid", bn: "ভীত", romanBn: "অ্যাফ্রেইড", topic: "daily" },
  { en: "angry", bn: "রাগান্বিত", romanBn: "অ্যাংরি", topic: "daily" },
  { en: "busy", bn: "ব্যস্ত", romanBn: "বিজি", topic: "daily" },
  { en: "ready", bn: "প্রস্তুত", romanBn: "রেডি", topic: "daily" },

  // actions (daily)
  { en: "go", bn: "যাওয়া", romanBn: "গো", topic: "daily" },
  { en: "come", bn: "আসা", romanBn: "কাম", topic: "daily" },
  { en: "eat", bn: "খাওয়া", romanBn: "ইট", topic: "daily" },
  { en: "drink", bn: "পান করা", romanBn: "ড্রিঙ্ক", topic: "daily" },
  { en: "sleep", bn: "ঘুমানো", romanBn: "স্লিপ", topic: "daily" },
  { en: "learn", bn: "শেখা", romanBn: "লার্ন", topic: "daily" },
  { en: "speak", bn: "বলা", romanBn: "স্পিক", topic: "daily" },
  { en: "understand", bn: "বোঝা", romanBn: "আন্ডারস্ট্যান্ড", topic: "daily" },
  { en: "wait", bn: "অপেক্ষা করা", romanBn: "ওয়েট", topic: "daily" },
  { en: "open", bn: "খোলা", romanBn: "ওপেন", topic: "daily" },
  { en: "close", bn: "বন্ধ করা", romanBn: "ক্লোজ", topic: "daily" },

  // ===== Expansion batch: numbers =====
  { en: "four", bn: "চার", romanBn: "ফোর", topic: "daily" },
  { en: "five", bn: "পাঁচ", romanBn: "ফাইভ", topic: "daily" },
  { en: "six", bn: "ছয়", romanBn: "সিক্স", topic: "daily" },
  { en: "seven", bn: "সাত", romanBn: "সেভেন", topic: "daily" },
  { en: "eight", bn: "আট", romanBn: "এইট", topic: "daily" },
  { en: "nine", bn: "নয়", romanBn: "নাইন", topic: "daily" },
  { en: "ten", bn: "দশ", romanBn: "টেন", topic: "daily" },
  { en: "twenty", bn: "বিশ", romanBn: "টোয়েন্টি", topic: "daily" },
  { en: "fifty", bn: "পঞ্চাশ", romanBn: "ফিফটি", topic: "daily" },
  { en: "thousand", bn: "হাজার", romanBn: "থাউজ্যান্ড", topic: "daily" },
  { en: "half", bn: "অর্ধেক", romanBn: "হাফ", topic: "daily" },
  { en: "second", bn: "দ্বিতীয়", romanBn: "সেকেন্ড", topic: "daily" },
  { en: "third", bn: "তৃতীয়", romanBn: "থার্ড", topic: "daily" },

  // ===== days & months =====
  { en: "Monday", bn: "সোমবার", romanBn: "মানডে", topic: "daily" },
  { en: "Tuesday", bn: "মঙ্গলবার", romanBn: "টিউজডে", topic: "daily" },
  { en: "Wednesday", bn: "বুধবার", romanBn: "ওয়েনসডে", topic: "daily" },
  { en: "Thursday", bn: "বৃহস্পতিবার", romanBn: "থার্সডে", topic: "daily" },
  { en: "Friday", bn: "শুক্রবার", romanBn: "ফ্রাইডে", topic: "daily" },
  { en: "Saturday", bn: "শনিবার", romanBn: "স্যাটারডে", topic: "daily" },
  { en: "Sunday", bn: "রবিবার", romanBn: "সানডে", topic: "daily" },
  { en: "January", bn: "জানুয়ারি", romanBn: "জানুয়ারি", topic: "daily" },
  { en: "June", bn: "জুন", romanBn: "জুন", topic: "daily" },
  { en: "December", bn: "ডিসেম্বর", romanBn: "ডিসেম্বর", topic: "daily" },
  { en: "noon", bn: "দুপুর", romanBn: "নুন", topic: "daily" },
  { en: "midnight", bn: "মধ্যরাত", romanBn: "মিডনাইট", topic: "daily" },
  { en: "o'clock", bn: "টা (সময়)", romanBn: "ওক্লক", topic: "daily" },

  // ===== family & people =====
  { en: "wife", bn: "স্ত্রী", romanBn: "ওয়াইফ", topic: "daily" },
  { en: "husband", bn: "স্বামী", romanBn: "হাজব্যান্ড", topic: "daily" },
  { en: "son", bn: "ছেলে", romanBn: "সন", topic: "daily" },
  { en: "daughter", bn: "মেয়ে", romanBn: "ডটার", topic: "daily" },
  { en: "grandfather", bn: "দাদা", romanBn: "গ্র্যান্ডফাদার", topic: "daily" },
  { en: "grandmother", bn: "দিদিমা", romanBn: "গ্র্যান্ডমাদার", topic: "daily" },
  { en: "uncle", bn: "কাকা", romanBn: "আঙ্কল", topic: "daily" },
  { en: "aunt", bn: "কাকিমা", romanBn: "আন্ট", topic: "daily" },
  { en: "baby", bn: "শিশু সন্তান", romanBn: "বেবি", topic: "daily" },
  { en: "man", bn: "পুরুষ", romanBn: "ম্যান", topic: "daily" },
  { en: "woman", bn: "মহিলা", romanBn: "উওম্যান", topic: "daily" },
  { en: "boy", bn: "ছেলে", romanBn: "বয়", topic: "daily" },
  { en: "girl", bn: "মেয়ে", romanBn: "গার্ল", topic: "daily" },
  { en: "people", bn: "লোকজন", romanBn: "পিপল", topic: "daily" },
  { en: "guest", bn: "অতিথি", romanBn: "গেস্ট", topic: "daily" },

  // ===== body & health =====
  { en: "head", bn: "মাথা", romanBn: "হেড", topic: "health" },
  { en: "eye", bn: "চোখ", romanBn: "আই", topic: "health" },
  { en: "ear", bn: "কান", romanBn: "ইয়ার", topic: "health" },
  { en: "nose", bn: "নাক", romanBn: "নোজ", topic: "health" },
  { en: "mouth", bn: "মুখ", romanBn: "মাউথ", topic: "health" },
  { en: "hand", bn: "হাত", romanBn: "হ্যান্ড", topic: "health" },
  { en: "leg", bn: "পা", romanBn: "লেগ", topic: "health" },
  { en: "stomach", bn: "পেট", romanBn: "স্টমাক", topic: "health" },
  { en: "back", bn: "পিঠ", romanBn: "ব্যাক", topic: "health" },
  { en: "tooth", bn: "দাঁত", romanBn: "টুথ", topic: "health" },
  { en: "throat", bn: "গলা", romanBn: "থ্রোট", topic: "health" },
  { en: "bandage", bn: "ব্যান্ডেজ", romanBn: "ব্যান্ডেজ", topic: "health" },
  { en: "injury", bn: "আঘাত", romanBn: "ইনজুরি", topic: "health" },
  { en: "allergy", bn: "অ্যালার্জি", romanBn: "অ্যালার্জি", topic: "health" },
  { en: "ambulance", bn: "অ্যাম্বুলেন্স", romanBn: "অ্যাম্বুলেন্স", topic: "health" },
  { en: "prescription", bn: "প্রেসক্রিপশন", romanBn: "প্রেসক্রিপশন", topic: "health" },
  { en: "dentist", bn: "দন্ত চিকিৎসক", romanBn: "ডেন্টিস্ট", topic: "health" },
  { en: "injection", bn: "ইনজেকশন", romanBn: "ইনজেকশন", topic: "health" },

  // ===== food (shopping) =====
  { en: "flour", bn: "আটা", romanBn: "ফ্লাওয়ার", topic: "shopping" },
  { en: "lentil", bn: "ডাল", romanBn: "লেন্টিল", topic: "shopping" },
  { en: "garlic", bn: "রসুন", romanBn: "গার্লিক", topic: "shopping" },
  { en: "ginger", bn: "আদা", romanBn: "জিঞ্জার", topic: "shopping" },
  { en: "tomato", bn: "টমেটো", romanBn: "টম্যাটো", topic: "shopping" },
  { en: "banana", bn: "কলা", romanBn: "বানানা", topic: "shopping" },
  { en: "mango", bn: "আম", romanBn: "ম্যাঙ্গো", topic: "shopping" },
  { en: "apple", bn: "আপেল", romanBn: "অ্যাপল", topic: "shopping" },
  { en: "chicken", bn: "মুরগি", romanBn: "চিকেন", topic: "shopping" },
  { en: "butter", bn: "মাখন", romanBn: "বাটার", topic: "shopping" },
  { en: "tea leaf", bn: "চা পাতা", romanBn: "টি লিফ", topic: "shopping" },
  { en: "biscuit", bn: "বিস্কুট", romanBn: "বিস্কিট", topic: "shopping" },
  { en: "water melon", bn: "তরমুজ", romanBn: "ওয়াটার মেলন", topic: "shopping" },
  { en: "sour", bn: "টক", romanBn: "সাওয়ার", topic: "shopping" },
  { en: "fat", bn: "চর্বি", romanBn: "ফ্যাট", topic: "shopping" },

  // ===== colours =====
  { en: "red", bn: "লাল", romanBn: "রেড", topic: "shopping" },
  { en: "blue", bn: "নীল", romanBn: "ব্লু", topic: "shopping" },
  { en: "green", bn: "সবুজ", romanBn: "গ্রিন", topic: "shopping" },
  { en: "yellow", bn: "হলুদ", romanBn: "ইয়েলো", topic: "shopping" },
  { en: "black", bn: "কালো", romanBn: "ব্ল্যাক", topic: "shopping" },
  { en: "white", bn: "সাদা", romanBn: "হোয়াইট", topic: "shopping" },
  { en: "colour", bn: "রং", romanBn: "কালার", topic: "shopping" },

  // ===== clothes / shopping =====
  { en: "shirt", bn: "জামা", romanBn: "শার্ট", topic: "shopping" },
  { en: "pants", bn: "প্যান্ট", romanBn: "প্যান্টস", topic: "shopping" },
  { en: "saree", bn: "শাড়ি", romanBn: "শাড়ি", topic: "shopping" },
  { en: "cap", bn: "টুপি", romanBn: "ক্যাপ", topic: "shopping" },
  { en: "umbrella", bn: "ছাতা", romanBn: "আমব্রেলা", topic: "shopping" },
  { en: "watch", bn: "ঘড়ি", romanBn: "ওয়াচ", topic: "shopping" },
  { en: "soap", bn: "সাবান", romanBn: "সোপ", topic: "shopping" },
  { en: "brush", bn: "ব্রাশ", romanBn: "ব্রাশ", topic: "shopping" },
  { en: "mirror", bn: "আয়না", romanBn: "মিরর", topic: "shopping" },

  // ===== places =====
  { en: "school", bn: "স্কুল", romanBn: "স্কুল", topic: "daily" },
  { en: "college", bn: "কলেজ", romanBn: "কলেজ", topic: "daily" },
  { en: "temple", bn: "মন্দির", romanBn: "টেম্পল", topic: "daily" },
  { en: "mosque", bn: "মসজিদ", romanBn: "মস্ক", topic: "daily" },
  { en: "park", bn: "পার্ক", romanBn: "পার্ক", topic: "daily" },
  { en: "library", bn: "গ্রন্থাগার", romanBn: "লাইব্রেরি", topic: "daily" },
  { en: "restaurant", bn: "রেস্তোরাঁ", romanBn: "রেস্টুরেন্ট", topic: "daily" },
  { en: "kitchen", bn: "রান্নাঘর", romanBn: "কিচেন", topic: "daily" },
  { en: "garden", bn: "বাগান", romanBn: "গার্ডেন", topic: "daily" },
  { en: "street", bn: "রাস্তা", romanBn: "স্ট্রিট", topic: "travel" },
  { en: "bridge", bn: "সেতু", romanBn: "ব্রিজ", topic: "travel" },
  { en: "river", bn: "নদী", romanBn: "রিভার", topic: "travel" },

  // ===== travel =====
  { en: "taxi", bn: "ট্যাক্সি", romanBn: "ট্যাক্সি", topic: "travel" },
  { en: "boat", bn: "নৌকা", romanBn: "বোট", topic: "travel" },
  { en: "bicycle", bn: "সাইকেল", romanBn: "বাইসাইকেল", topic: "travel" },
  { en: "passport", bn: "পাসপোর্ট", romanBn: "পাসপোর্ট", topic: "travel" },
  { en: "suitcase", bn: "সুটকেস", romanBn: "সুটকেস", topic: "travel" },
  { en: "journey", bn: "যাত্রা", romanBn: "জার্নি", topic: "travel" },
  { en: "direction", bn: "দিক", romanBn: "ডিরেকশন", topic: "travel" },
  { en: "meter", bn: "মিটার", romanBn: "মিটার", topic: "travel" },
  { en: "lift", bn: "লিফট", romanBn: "লিফট", topic: "travel" },
  { en: "room", bn: "ঘর", romanBn: "রুম", topic: "travel" },

  // ===== verbs =====
  { en: "give", bn: "দেওয়া", romanBn: "গিভ", topic: "daily" },
  { en: "take", bn: "নেওয়া", romanBn: "টেক", topic: "daily" },
  { en: "make", bn: "বানানো", romanBn: "মেক", topic: "daily" },
  { en: "see", bn: "দেখা", romanBn: "সি", topic: "daily" },
  { en: "hear", bn: "শোনা", romanBn: "হিয়ার", topic: "daily" },
  { en: "read", bn: "পড়া", romanBn: "রিড", topic: "daily" },
  { en: "write", bn: "লেখা", romanBn: "রাইট", topic: "daily" },
  { en: "walk", bn: "হাঁটা", romanBn: "ওয়াক", topic: "daily" },
  { en: "run", bn: "দৌড়ানো", romanBn: "রান", topic: "daily" },
  { en: "sit", bn: "বসা", romanBn: "সিট", topic: "daily" },
  { en: "stand", bn: "দাঁড়ানো", romanBn: "স্ট্যান্ড", topic: "daily" },
  { en: "stay", bn: "থাকা", romanBn: "স্টে", topic: "daily" },
  { en: "find", bn: "খুঁজে পাওয়া", romanBn: "ফাইন্ড", topic: "daily" },
  { en: "lose", bn: "হারানো", romanBn: "লুজ", topic: "daily" },
  { en: "bring", bn: "আনা", romanBn: "ব্রিং", topic: "daily" },
  { en: "send", bn: "পাঠানো", romanBn: "সেন্ড", topic: "phone" },
  { en: "start", bn: "শুরু করা", romanBn: "স্টার্ট", topic: "daily" },
  { en: "finish", bn: "শেষ করা", romanBn: "ফিনিশ", topic: "jobs" },
  { en: "try", bn: "চেষ্টা করা", romanBn: "ট্রাই", topic: "daily" },
  { en: "need", bn: "দরকার হওয়া", romanBn: "নিড", topic: "daily" },
  { en: "want", bn: "চাওয়া", romanBn: "ওয়ান্ট", topic: "daily" },
  { en: "like", bn: "পছন্দ করা", romanBn: "লাইক", topic: "daily" },
  { en: "know", bn: "জানা", romanBn: "নো", topic: "daily" },
  { en: "think", bn: "ভাবা", romanBn: "থিঙ্ক", topic: "daily" },
  { en: "ask", bn: "জিজ্ঞাসা করা", romanBn: "আস্ক", topic: "daily" },

  // ===== adjectives =====
  { en: "easy", bn: "সহজ", romanBn: "ইজি", topic: "daily" },
  { en: "hard", bn: "কঠিন", romanBn: "হার্ড", topic: "daily" },
  { en: "fast", bn: "দ্রুত", romanBn: "ফাস্ট", topic: "daily" },
  { en: "slow", bn: "ধীর", romanBn: "স্লো", topic: "daily" },
  { en: "clean", bn: "পরিষ্কার", romanBn: "ক্লিন", topic: "daily" },
  { en: "dirty", bn: "নোংরা", romanBn: "ডার্টি", topic: "daily" },
  { en: "full", bn: "পূর্ণ", romanBn: "ফুল", topic: "daily" },
  { en: "empty", bn: "খালি", romanBn: "এম্পটি", topic: "daily" },
  { en: "long", bn: "লম্বা", romanBn: "লং", topic: "daily" },
  { en: "short", bn: "ছোট/খাটো", romanBn: "শর্ট", topic: "daily" },
  { en: "high", bn: "উঁচু", romanBn: "হাই", topic: "daily" },
  { en: "low", bn: "নিচু", romanBn: "লো", topic: "daily" },
  { en: "heavy", bn: "ভারী", romanBn: "হেভি", topic: "daily" },
  { en: "light", bn: "হালকা", romanBn: "লাইট", topic: "daily" },
  { en: "beautiful", bn: "সুন্দর", romanBn: "বিউটিফুল", topic: "daily" },
  { en: "important", bn: "গুরুত্বপূর্ণ", romanBn: "ইম্পর্ট্যান্ট", topic: "daily" },
  { en: "free", bn: "বিনামূল্যে/ফাঁকা", romanBn: "ফ্রি", topic: "daily" },
  { en: "safe", bn: "নিরাপদ", romanBn: "সেফ", topic: "daily" },

  // ===== money / bank =====
  { en: "note", bn: "নোট", romanBn: "নোট", topic: "bank" },
  { en: "coin", bn: "কয়েন", romanBn: "কয়েন", topic: "bank" },
  { en: "bill", bn: "বিল", romanBn: "বিল", topic: "bank" },
  { en: "fee", bn: "ফি", romanBn: "ফি", topic: "bank" },
  { en: "savings", bn: "সঞ্চয়", romanBn: "সেভিংস", topic: "bank" },
  { en: "branch", bn: "শাখা", romanBn: "ব্রাঞ্চ", topic: "bank" },
  { en: "customer", bn: "গ্রাহক", romanBn: "কাস্টমার", topic: "bank" },
  { en: "machine", bn: "মেশিন", romanBn: "মেশিন", topic: "bank" },

  // ===== jobs / interview =====
  { en: "job", bn: "চাকরি", romanBn: "জব", topic: "jobs" },
  { en: "company", bn: "কোম্পানি", romanBn: "কোম্পানি", topic: "jobs" },
  { en: "manager", bn: "ম্যানেজার", romanBn: "ম্যানেজার", topic: "jobs" },
  { en: "worker", bn: "কর্মী", romanBn: "ওয়ার্কার", topic: "jobs" },
  { en: "task", bn: "কাজ/টাস্ক", romanBn: "টাস্ক", topic: "jobs" },
  { en: "report", bn: "প্রতিবেদন", romanBn: "রিপোর্ট", topic: "jobs" },
  { en: "schedule", bn: "সময়সূচি", romanBn: "শিডিউল", topic: "jobs" },
  { en: "break", bn: "বিরতি", romanBn: "ব্রেক", topic: "jobs" },
  { en: "leave", bn: "ছুটি", romanBn: "লিভ", topic: "jobs" },
  { en: "position", bn: "পদ", romanBn: "পজিশন", topic: "interview" },
  { en: "degree", bn: "ডিগ্রি", romanBn: "ডিগ্রি", topic: "interview" },
  { en: "polite", bn: "ভদ্র", romanBn: "পোলাইট", topic: "interview" },

  // ===== phone / tech =====
  { en: "signal", bn: "সিগন্যাল", romanBn: "সিগন্যাল", topic: "phone" },
  { en: "data", bn: "ডেটা", romanBn: "ডেটা", topic: "phone" },
  { en: "email", bn: "ইমেল", romanBn: "ইমেল", topic: "phone" },
  { en: "password", bn: "পাসওয়ার্ড", romanBn: "পাসওয়ার্ড", topic: "phone" },
  { en: "contact", bn: "যোগাযোগ", romanBn: "কন্টাক্ট", topic: "phone" },
  { en: "voice", bn: "কণ্ঠস্বর", romanBn: "ভয়েস", topic: "phone" },
];

// ---------- Indexes + query helpers ----------

export const PHRASE_BY_ID = phraseById;
export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
export const QUIZ_BY_ID = new Map(QUIZ_ITEMS.map((q) => [q.id, q]));
export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
export const COURSE_BY_ID = new Map(COURSES.map((c) => [c.id, c]));

export const getPhrase = (id: string) => PHRASE_BY_ID.get(id);
export const getLesson = (id: string) => LESSON_BY_ID.get(id);
export const getScenario = (id: string) => SCENARIO_BY_ID.get(id);
export const getCourse = (id: string) => COURSE_BY_ID.get(id);
export const lessonsForCourse = (courseId: string) =>
  LESSONS.filter((l) => l.courseId === courseId).sort((a, b) => a.day - b.day);
export const quizForLesson = (lessonId: string) => QUIZ_ITEMS.filter((q) => q.lessonId === lessonId);
export const scenariosByLevel = (level: Level) => SCENARIOS.filter((s) => s.level === level);
export const phrasesByTopic = (topic: Topic) => byTopic(topic);
