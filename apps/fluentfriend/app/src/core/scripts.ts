/**
 * Per-scenario OFFLINE role-play scripts — the conversation a learner gets when
 * the AI is offline or the daily quota is spent. Each scenario has its OWN 5-turn
 * exchange with context-appropriate Bangla hints and tap-to-reply suggestion
 * chips, so "market", "bank" and "doctor" feel like real, different situations
 * (QA: every scenario used to share one generic 3-turn script). Reviewed by the
 * bilingual editor alongside the phrasebook. Keyed by scenario id; catalog.ts
 * wraps each into a ScriptedRolePlay (fb_<id>) and supplies a safe generic
 * fallback for any id without a bespoke script.
 */
export interface ScriptTurn {
  ai: string;
  hintBn: string;
  suggestions: string[];
}

export const SCENARIO_SCRIPTS: Record<string, ScriptTurn[]> = {
  sc_intro: [
    { ai: "Hi! I'm Priya. What's your name?", hintBn: "নিজের নাম বলুন", suggestions: ["My name is Rahul.", "I'm Anita.", "Hello, I'm Karim."] },
    { ai: "Nice to meet you! Where are you from?", hintBn: "কোথা থেকে এসেছেন বলুন", suggestions: ["I'm from Kolkata.", "I live in Dhaka.", "I'm from a small town."] },
    { ai: "Great. What do you do?", hintBn: "আপনি কী করেন বলুন", suggestions: ["I'm a student.", "I work in a shop.", "I'm looking for a job."] },
    { ai: "That's nice. Why do you want to learn English?", hintBn: "কেন ইংরেজি শিখছেন বলুন", suggestions: ["For my job.", "To talk to people.", "For travel."] },
    { ai: "Wonderful. Let's keep practicing together!", hintBn: "ধন্যবাদ জানিয়ে বিদায় নিন", suggestions: ["Thank you!", "See you soon.", "I enjoyed this."] },
  ],
  sc_greet: [
    { ai: "Good morning! How are you today?", hintBn: "অভিবাদন জানিয়ে উত্তর দিন", suggestions: ["Good morning!", "I'm fine, thank you.", "I'm good, and you?"] },
    { ai: "I'm well, thanks. Lovely weather, isn't it?", hintBn: "আবহাওয়া নিয়ে বলুন", suggestions: ["Yes, it's sunny.", "It's a bit cold.", "I like this weather."] },
    { ai: "Are you going to the market?", hintBn: "কোথায় যাচ্ছেন বলুন", suggestions: ["Yes, for vegetables.", "No, I'm going to work.", "Just for a walk."] },
    { ai: "Nice. Say hello to your family for me.", hintBn: "ধন্যবাদ জানান", suggestions: ["I will, thank you.", "Sure, thanks!", "Of course."] },
    { ai: "Have a good day! See you around.", hintBn: "বিদায় জানান", suggestions: ["You too!", "See you!", "Take care."] },
  ],
  sc_market: [
    { ai: "Welcome! These tomatoes are fresh. How many do you want?", hintBn: "কত কেজি চান বলুন", suggestions: ["One kilo, please.", "Two kilos.", "Just half a kilo."] },
    { ai: "Okay, one kilo. That's 40 rupees.", hintBn: "দাম নিয়ে দরদাম করুন", suggestions: ["That's too expensive.", "Can you lower the price?", "Okay, I'll take it."] },
    { ai: "Alright, 35 rupees for you. Anything else?", hintBn: "আর কী লাগবে বলুন", suggestions: ["Some onions too.", "Do you have potatoes?", "No, that's all."] },
    { ai: "Here are your onions. Do you have change?", hintBn: "টাকা দেওয়ার কথা বলুন", suggestions: ["Yes, here you are.", "Only a 100 note.", "Let me check."] },
    { ai: "Thank you! Please come again.", hintBn: "ধন্যবাদ জানিয়ে বিদায়", suggestions: ["Thank you!", "See you next time.", "Goodbye."] },
  ],
  sc_tea: [
    { ai: "Hello! Would you like some tea?", hintBn: "চা অর্ডার করুন", suggestions: ["Yes, one tea please.", "Two teas, please.", "A tea with less sugar."] },
    { ai: "Sure. Milk tea or black tea?", hintBn: "কোন চা চান বলুন", suggestions: ["Milk tea, please.", "Black tea.", "Milk tea, less sugar."] },
    { ai: "Okay. Anything to eat? We have biscuits.", hintBn: "খাবার চান কিনা বলুন", suggestions: ["Yes, some biscuits.", "No, just tea.", "What else do you have?"] },
    { ai: "Here's your tea and biscuits. That's 20 rupees.", hintBn: "টাকা দিন", suggestions: ["Here you are.", "Thank you.", "Keep the change."] },
    { ai: "Thanks! Enjoy your tea.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you!", "It's nice.", "See you."] },
  ],
  sc_directions: [
    { ai: "Hello, can I help you?", hintBn: "স্টেশন কোথায় জিজ্ঞাসা করুন", suggestions: ["Where is the station?", "How do I get to the station?", "Excuse me, I'm lost."] },
    { ai: "The station? Go straight and turn left.", hintBn: "কতদূর জিজ্ঞাসা করুন", suggestions: ["How far is it?", "Is it near?", "Can I walk there?"] },
    { ai: "It's about five minutes on foot.", hintBn: "নিশ্চিত হয়ে নিন", suggestions: ["Left at the corner?", "Okay, I understand.", "Thank you so much."] },
    { ai: "Yes, left at the big tree. You'll see it.", hintBn: "বুঝেছেন বলুন", suggestions: ["Got it, thanks.", "You're very kind.", "Thank you for your help."] },
    { ai: "You're welcome. Have a safe trip!", hintBn: "বিদায় জানান", suggestions: ["Thank you!", "Goodbye.", "Take care."] },
  ],
  sc_bus: [
    { ai: "Where are you going?", hintBn: "গন্তব্য বলুন", suggestions: ["To the market.", "City center, please.", "One to the station."] },
    { ai: "Okay, the fare is 15 rupees.", hintBn: "টাকা দিন বা খুচরোর কথা বলুন", suggestions: ["Here you are.", "Do you have change?", "Only a 50 note, sorry."] },
    { ai: "That's fine. Please sit down.", hintBn: "কখন নামবেন জিজ্ঞাসা করুন", suggestions: ["Tell me when to get off.", "Where do I get off?", "Is it a long ride?"] },
    { ai: "Sure, I'll tell you. It's three stops.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "Okay, three stops.", "You're very helpful."] },
    { ai: "This is your stop. Please get off here.", hintBn: "নামার সময় ধন্যবাদ", suggestions: ["Thank you!", "Have a good day.", "Goodbye."] },
  ],
  sc_shop_clothes: [
    { ai: "Hello! Are you looking for a shirt?", hintBn: "কী কিনতে চান বলুন", suggestions: ["Yes, a blue shirt.", "I need a shirt.", "Just looking, thanks."] },
    { ai: "We have many. What size do you need?", hintBn: "সাইজ বলুন", suggestions: ["Medium, please.", "Large size.", "I'm not sure of my size."] },
    { ai: "Here's a medium. Would you like to try it?", hintBn: "ট্রায়াল বা দাম জিজ্ঞাসা করুন", suggestions: ["Can I try it on?", "How much is it?", "Any other colors?"] },
    { ai: "It's 600 rupees. It fits you well!", hintBn: "দরদাম করুন বা সিদ্ধান্ত নিন", suggestions: ["Can you lower the price?", "I'll take it.", "That's a bit high."] },
    { ai: "Okay, 550 for you. Thank you!", hintBn: "টাকা দিয়ে বিদায় নিন", suggestions: ["Thank you!", "Here you are.", "Goodbye."] },
  ],
  sc_phone_basic: [
    { ai: "Hello, who is speaking?", hintBn: "নিজের পরিচয় দিন", suggestions: ["Hello, this is Rahul.", "This is Anita speaking.", "Hi, who is this?"] },
    { ai: "Hi, this is Sameer. Is this a good time?", hintBn: "সময় আছে কিনা বলুন", suggestions: ["Yes, go ahead.", "Can you call later?", "I'm a little busy."] },
    { ai: "Sure. I wanted to ask about the meeting.", hintBn: "কোন মিটিং জিজ্ঞাসা করুন", suggestions: ["Which meeting?", "What time is it?", "Please tell me more."] },
    { ai: "The one tomorrow at 10. Can you come?", hintBn: "হ্যাঁ বা না জানান", suggestions: ["Yes, I can come.", "I'm not sure.", "Let me check."] },
    { ai: "Great, see you then. Bye!", hintBn: "বিদায় জানান", suggestions: ["Okay, bye!", "See you tomorrow.", "Thanks for calling."] },
  ],
  sc_restaurant: [
    { ai: "Good evening! A table for how many?", hintBn: "কতজন বলুন", suggestions: ["A table for two.", "Just for me.", "Four people, please."] },
    { ai: "This way. Here's the menu. What would you like?", hintBn: "খাবার অর্ডার করুন", suggestions: ["I'd like fried rice.", "What do you recommend?", "Chicken curry, please."] },
    { ai: "Good choice. Anything to drink?", hintBn: "পানীয় অর্ডার করুন", suggestions: ["A glass of water.", "One cold drink.", "Just water, thanks."] },
    { ai: "Would you like it spicy or mild?", hintBn: "ঝাল পছন্দ জানান", suggestions: ["Not too spicy, please.", "Medium spicy.", "I like it spicy."] },
    { ai: "Perfect, your food is on the way. Enjoy!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "That sounds great.", "Can I get the bill later?"] },
  ],
  sc_clinic: [
    { ai: "Hello, please sit. What's the problem today?", hintBn: "উপসর্গ বলুন", suggestions: ["I have a fever.", "My head hurts.", "I have a cough."] },
    { ai: "I see. How long have you felt this way?", hintBn: "কতদিন ধরে বলুন", suggestions: ["Since yesterday.", "For two days.", "About a week."] },
    { ai: "Do you have any other symptoms?", hintBn: "আর কোনো সমস্যা বলুন", suggestions: ["I feel tired.", "My throat hurts.", "No, just the fever."] },
    { ai: "Okay. I'll give you medicine. Any allergies?", hintBn: "অ্যালার্জি আছে কিনা বলুন", suggestions: ["No allergies.", "I'm allergic to penicillin.", "I'm not sure."] },
    { ai: "Take this twice a day. Rest and drink water.", hintBn: "প্রশ্ন করুন বা ধন্যবাদ দিন", suggestions: ["Thank you, doctor.", "How many days?", "Should I come back?"] },
  ],
  sc_pharmacy: [
    { ai: "Hello, how can I help you?", hintBn: "কী ওষুধ চান বলুন", suggestions: ["Medicine for a cold.", "Do you have paracetamol?", "I have a prescription."] },
    { ai: "Sure. Is it for you? Any fever?", hintBn: "কার জন্য ও উপসর্গ বলুন", suggestions: ["Yes, a mild fever.", "It's for my child.", "Just a headache."] },
    { ai: "This works well. Take one after meals.", hintBn: "ডোজ জিজ্ঞাসা করুন", suggestions: ["How many times a day?", "Before or after food?", "For how many days?"] },
    { ai: "Twice a day for three days. Anything else?", hintBn: "আর কিছু লাগবে বলুন", suggestions: ["Some cough syrup too.", "No, that's all.", "Do you have vitamins?"] },
    { ai: "Here you go. That's 120 rupees. Get well soon!", hintBn: "টাকা দিয়ে ধন্যবাদ", suggestions: ["Thank you.", "Here you are.", "Goodbye."] },
  ],
  sc_bank_open: [
    { ai: "Good morning. How can I help you?", hintBn: "অ্যাকাউন্ট খুলতে চান বলুন", suggestions: ["I want to open an account.", "I'd like a savings account.", "How do I open an account?"] },
    { ai: "Sure. Do you have your ID and photos?", hintBn: "কাগজপত্র আছে বলুন", suggestions: ["Yes, I have my ID.", "What documents do I need?", "I have two photos."] },
    { ai: "Great. Savings or current account?", hintBn: "কোন অ্যাকাউন্ট বলুন", suggestions: ["Savings, please.", "What's the difference?", "A simple savings account."] },
    { ai: "Okay. The minimum balance is 500 rupees.", hintBn: "সম্মতি দিন বা প্রশ্ন করুন", suggestions: ["That's fine.", "Can I deposit now?", "Is there a monthly fee?"] },
    { ai: "All done. Your account is ready!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you so much.", "That was quick!", "Goodbye."] },
  ],
  sc_atm: [
    { ai: "You look confused. Do you need help?", hintBn: "সাহায্য চান বলুন", suggestions: ["Yes, please help me.", "How do I withdraw money?", "The machine isn't working."] },
    { ai: "No problem. First, put your card in here.", hintBn: "পরের ধাপ জিজ্ঞাসা করুন", suggestions: ["Okay, now what?", "Which way?", "Like this?"] },
    { ai: "Now enter your PIN. Don't tell anyone.", hintBn: "বুঝেছেন বলুন", suggestions: ["Okay, I entered it.", "Should I hide it?", "Got it."] },
    { ai: "Choose 'Withdraw' and type the amount.", hintBn: "টাকার পরিমাণ বলুন", suggestions: ["I want 1000 rupees.", "Which button?", "Okay, I typed it."] },
    { ai: "Take your cash and your card. All done!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you so much!", "You're very kind.", "Goodbye."] },
  ],
  sc_train_book: [
    { ai: "Hello. Where would you like to travel?", hintBn: "গন্তব্য বলুন", suggestions: ["To Delhi, please.", "One ticket to Howrah.", "I want to go to Mumbai."] },
    { ai: "Okay. For which date?", hintBn: "তারিখ বলুন", suggestions: ["For tomorrow.", "This Friday.", "Next Monday."] },
    { ai: "How many tickets, and which class?", hintBn: "সংখ্যা ও ক্লাস বলুন", suggestions: ["Two, sleeper class.", "One, AC please.", "Just one ticket."] },
    { ai: "That will be 850 rupees. Is that okay?", hintBn: "সম্মতি দিন বা প্রশ্ন করুন", suggestions: ["Yes, that's fine.", "What time is the train?", "Any window seat?"] },
    { ai: "Here's your ticket. Have a safe journey!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you!", "Have a good day.", "Goodbye."] },
  ],
  sc_hotel: [
    { ai: "Welcome! Do you have a reservation?", hintBn: "বুকিং আছে কিনা বলুন", suggestions: ["Yes, under Rahul.", "No, do you have rooms?", "I booked online."] },
    { ai: "Let me check. A room for how many nights?", hintBn: "কত রাত বলুন", suggestions: ["Two nights.", "Just one night.", "Three nights, please."] },
    { ai: "We have a room on the second floor. Okay?", hintBn: "সম্মতি দিন বা প্রশ্ন করুন", suggestions: ["That's fine.", "Is breakfast included?", "Does it have WiFi?"] },
    { ai: "Yes, breakfast is at 8. May I see your ID?", hintBn: "আইডি দিন", suggestions: ["Here is my ID.", "Sure, one moment.", "Of course."] },
    { ai: "Thank you. Here's your key. Enjoy your stay!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you!", "Where is the lift?", "Goodbye."] },
  ],
  sc_shop_return: [
    { ai: "Hello, how can I help you?", hintBn: "ফেরত দিতে চান বলুন", suggestions: ["I want to return this.", "This shirt is damaged.", "Can I get a refund?"] },
    { ai: "I'm sorry. What's the problem with it?", hintBn: "সমস্যা বলুন", suggestions: ["It's the wrong size.", "There's a hole in it.", "The color faded."] },
    { ai: "Do you have the receipt?", hintBn: "রসিদ আছে বলুন", suggestions: ["Yes, here it is.", "I bought it yesterday.", "It's on my phone."] },
    { ai: "Would you like a refund or an exchange?", hintBn: "ফেরত না বদল বলুন", suggestions: ["A refund, please.", "I'd like to exchange it.", "Can I get a bigger size?"] },
    { ai: "No problem. Here's your refund. Sorry again.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "That's okay.", "Thanks for your help."] },
  ],
  sc_phone_appt: [
    { ai: "Hello, City Clinic. How can I help you?", hintBn: "অ্যাপয়েন্টমেন্ট চান বলুন", suggestions: ["I'd like an appointment.", "Can I see a doctor tomorrow?", "I want to book a time."] },
    { ai: "Sure. What is it regarding?", hintBn: "কারণ বলুন", suggestions: ["A general checkup.", "I have a fever.", "For my eyes."] },
    { ai: "Okay. Morning or afternoon?", hintBn: "সময় বলুন", suggestions: ["Morning, please.", "Afternoon is better.", "Any time works."] },
    { ai: "We have 11 AM tomorrow. Does that work?", hintBn: "সম্মতি দিন বা প্রশ্ন করুন", suggestions: ["Yes, that's perfect.", "Can it be earlier?", "11 is fine."] },
    { ai: "Booked! Please come 10 minutes early.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "Okay, I'll be early.", "Goodbye."] },
  ],
  sc_small_talk: [
    { ai: "Hey! How was your weekend?", hintBn: "সপ্তাহান্ত কেমন ছিল বলুন", suggestions: ["It was nice, thanks.", "I rested at home.", "I went to a wedding."] },
    { ai: "Sounds good. Did you do anything fun?", hintBn: "কী করেছেন বলুন", suggestions: ["I watched a movie.", "I met some friends.", "Not much, just relaxed."] },
    { ai: "Nice. Busy day today?", hintBn: "আজকের কাজ নিয়ে বলুন", suggestions: ["Yes, a lot of work.", "Not too bad.", "I have a meeting soon."] },
    { ai: "Same here. Want to grab lunch later?", hintBn: "লাঞ্চ প্ল্যান বলুন", suggestions: ["Sure, sounds great.", "Maybe at 1?", "I'd love to."] },
    { ai: "Great, see you at 1. Have a good morning!", hintBn: "বিদায় জানান", suggestions: ["You too!", "See you then.", "Thanks!"] },
  ],
  sc_interview: [
    { ai: "Thanks for coming. Tell me about yourself.", hintBn: "নিজের সম্পর্কে বলুন", suggestions: ["I have three years of experience.", "I'm a hard worker.", "I recently finished my studies."] },
    { ai: "Interesting. Why do you want this job?", hintBn: "কেন এই চাকরি বলুন", suggestions: ["I want to grow my skills.", "I like this company.", "It matches my experience."] },
    { ai: "What is your biggest strength?", hintBn: "নিজের শক্তি বলুন", suggestions: ["I learn quickly.", "I'm good with people.", "I stay calm under pressure."] },
    { ai: "And a weakness you're working on?", hintBn: "দুর্বলতা বলুন", suggestions: ["I can be too careful.", "I'm improving my English.", "I take on too much work."] },
    { ai: "Good answers. When can you start?", hintBn: "কবে শুরু করতে পারেন বলুন", suggestions: ["I can start next week.", "Immediately.", "In two weeks."] },
  ],
  sc_salary: [
    { ai: "We'd like to offer you the role. Let's discuss salary.", hintBn: "আগ্রহ জানান", suggestions: ["Thank you, I'm interested.", "That's great news.", "I'd love to join."] },
    { ai: "We're thinking of 30,000 a month. Thoughts?", hintBn: "আপনার প্রত্যাশা বলুন", suggestions: ["I was hoping for more.", "Can we discuss it?", "I expected around 35,000."] },
    { ai: "I see. What figure did you have in mind?", hintBn: "সংখ্যা বলুন", suggestions: ["Around 35,000.", "I think 34,000 is fair.", "36,000, based on my experience."] },
    { ai: "That's a bit high. Any flexibility?", hintBn: "নমনীয়তা জানান", suggestions: ["I can be flexible.", "Let's meet in the middle.", "32,000 could work."] },
    { ai: "Let's agree on 33,000. Does that work?", hintBn: "সিদ্ধান্ত জানান", suggestions: ["Yes, that works.", "That sounds fair.", "I accept, thank you."] },
  ],
  sc_complaint: [
    { ai: "Hello, how can I help you today?", hintBn: "অভিযোগ শুরু করুন", suggestions: ["I have a complaint.", "I'm not happy with my order.", "There's a problem with the service."] },
    { ai: "I'm sorry. Can you explain what happened?", hintBn: "কী হয়েছে বলুন", suggestions: ["My order arrived late.", "The item was broken.", "I was charged twice."] },
    { ai: "That shouldn't happen. Do you have the details?", hintBn: "তথ্য দিন", suggestions: ["Here's my order number.", "I have the receipt.", "It happened yesterday."] },
    { ai: "Thank you. How would you like us to fix this?", hintBn: "সমাধান চান", suggestions: ["I'd like a refund.", "Please send a new one.", "I want an apology."] },
    { ai: "Understood. We'll fix it today. Sorry again.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you for understanding.", "I appreciate it.", "Please make sure it's done."] },
  ],
  sc_meeting: [
    { ai: "Let's begin. Does anyone have updates?", hintBn: "আপডেট দিন", suggestions: ["Yes, I have one.", "I'd like to share something.", "My task is on track."] },
    { ai: "Go ahead, please.", hintBn: "আপডেট বিস্তারিত বলুন", suggestions: ["We finished the first part.", "Sales went up this week.", "We faced a small delay."] },
    { ai: "Good. Any challenges we should know about?", hintBn: "সমস্যা জানান", suggestions: ["We need more time.", "The budget is tight.", "No major issues."] },
    { ai: "Noted. What do you suggest we do?", hintBn: "প্রস্তাব দিন", suggestions: ["Let's extend the deadline.", "Maybe add one more person.", "Let's review it next week."] },
    { ai: "That makes sense. Thanks for your input.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "Happy to help.", "Let me know if you need more."] },
  ],
  sc_presentation: [
    { ai: "Thanks for joining. Walk us through your progress.", hintBn: "অগ্রগতি শুরু করুন", suggestions: ["Sure, let me explain.", "We're almost done.", "Here's what we did."] },
    { ai: "Great. What have you completed so far?", hintBn: "কী শেষ হয়েছে বলুন", suggestions: ["We finished the design.", "The first phase is done.", "We tested the main features."] },
    { ai: "And what's left to do?", hintBn: "বাকি কাজ বলুন", suggestions: ["We need to test more.", "Just the final review.", "A few small fixes."] },
    { ai: "When do you expect to finish?", hintBn: "সময়সীমা বলুন", suggestions: ["By next Friday.", "In about a week.", "Early next month."] },
    { ai: "Excellent work. Keep it up!", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "I appreciate it.", "I'll keep you updated."] },
  ],
  sc_landlord: [
    { ai: "Hello. You wanted to talk about the flat?", hintBn: "বিষয় শুরু করুন", suggestions: ["Yes, about the rent.", "There's a problem to fix.", "I have a question."] },
    { ai: "Of course. What's the matter?", hintBn: "সমস্যা বলুন", suggestions: ["The tap is leaking.", "The rent is a bit high.", "The fan isn't working."] },
    { ai: "I see. How long has this been a problem?", hintBn: "কতদিন ধরে বলুন", suggestions: ["For a few days.", "Since last week.", "It just started."] },
    { ai: "Alright, I'll send someone. Anything else?", hintBn: "আর কিছু বলুন", suggestions: ["Can we discuss the rent?", "No, that's all.", "Please fix it soon."] },
    { ai: "Okay, I'll look into it. Thanks for telling me.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you.", "I appreciate it.", "Please let me know."] },
  ],
  sc_customer: [
    { ai: "Excuse me, can you help me find something?", hintBn: "সাহায্যের প্রস্তাব দিন", suggestions: ["Of course, what do you need?", "Yes, how can I help?", "Sure, what are you looking for?"] },
    { ai: "I'm looking for a gift for my mother.", hintBn: "প্রশ্ন করুন", suggestions: ["What does she like?", "Any budget in mind?", "For what occasion?"] },
    { ai: "Maybe something for the kitchen, not too costly.", hintBn: "প্রস্তাব দিন", suggestions: ["We have nice cookware.", "How about this set?", "Let me show you some options."] },
    { ai: "Oh, that looks nice. How much is it?", hintBn: "দাম বলুন", suggestions: ["It's 800 rupees.", "This one is on offer.", "It's within your budget."] },
    { ai: "Great, I'll take it. Thanks for your help!", hintBn: "ধন্যবাদ জানান", suggestions: ["You're welcome!", "Happy to help.", "Enjoy your gift!"] },
  ],
  sc_describe_problem: [
    { ai: "Hi, you called about a problem? Tell me what's wrong.", hintBn: "সমস্যা শুরু করুন", suggestions: ["My laptop won't start.", "There's no internet.", "The screen is broken."] },
    { ai: "Okay. When did it start?", hintBn: "কখন শুরু বলুন", suggestions: ["This morning.", "Since yesterday.", "A few hours ago."] },
    { ai: "Did you try restarting it?", hintBn: "কী চেষ্টা করেছেন বলুন", suggestions: ["Yes, but nothing happened.", "I tried, it didn't help.", "Not yet, should I?"] },
    { ai: "Any warning lights or sounds?", hintBn: "বিস্তারিত বলুন", suggestions: ["A red light blinks.", "There's a beep sound.", "No, nothing at all."] },
    { ai: "Got it. I'll send a technician today. Thank you.", hintBn: "ধন্যবাদ জানান", suggestions: ["Thank you so much.", "Please come soon.", "I appreciate it."] },
  ],
  sc_plan_trip: [
    { ai: "I'm so excited! Where should we go this time?", hintBn: "জায়গা প্রস্তাব করুন", suggestions: ["How about the hills?", "Let's go to the beach.", "I'd love to visit Jaipur."] },
    { ai: "Ooh, nice idea! When are you free?", hintBn: "সময় বলুন", suggestions: ["Next weekend.", "During the holidays.", "Any time next month."] },
    { ai: "Perfect. Train or bus?", hintBn: "যাতায়াত বলুন", suggestions: ["Let's take the train.", "A bus is cheaper.", "Maybe we can drive."] },
    { ai: "Good thinking. Where will we stay?", hintBn: "থাকার ব্যবস্থা বলুন", suggestions: ["Let's book a hotel.", "A guesthouse is fine.", "Somewhere cheap and clean."] },
    { ai: "This sounds amazing. Let's start booking!", hintBn: "উচ্ছ্বাস জানান", suggestions: ["I can't wait!", "Let's do it!", "This will be fun."] },
  ],
};
