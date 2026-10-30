/**
 * Bundled question bank for the 2026 speaking-test format (pure data, no logic).
 * Two task types:
 *  - Listen & Repeat: you hear one sentence once, then repeat it word-for-word.
 *    The sentence IS the target; difficulty is derived from its length.
 *  - Take an Interview: an open question you answer for ~45s; a model/sample
 *    answer and a "why this scores high" note are generated from the question.
 *
 * Content is tagged by topic so the UI can filter, and bundled so every section
 * works fully offline. `CONTENT_VERSION` backs the in-app content manifest so a
 * refresh never leaves a section empty (we only ever add items on top).
 */
export const CONTENT_VERSION = 1;

export const TOPICS = [
  "Campus life",
  "Academics",
  "Technology",
  "Environment",
  "Work & career",
  "Travel",
  "Health",
  "Society",
  "Arts & media",
  "Everyday",
] as const;
export type Topic = (typeof TOPICS)[number];

export interface RawRepeat {
  text: string;
  topic: Topic;
}
export interface RawInterview {
  q: string;
  topic: Topic;
}

/** 100+ Listen & Repeat items, grouped loosely by topic, mixed lengths. */
export const REPEAT_ITEMS: RawRepeat[] = [
  // Campus life
  { text: "The library closes early on Fridays.", topic: "Campus life" },
  { text: "Please return your tray to the counter.", topic: "Campus life" },
  { text: "Lectures for first-year students start next Monday.", topic: "Campus life" },
  { text: "The student union is hosting a career fair this week.", topic: "Campus life" },
  { text: "Most dormitories offer free laundry on the ground floor.", topic: "Campus life" },
  { text: "You can book a study room online up to three days in advance.", topic: "Campus life" },
  { text: "The campus shuttle runs every fifteen minutes during the morning rush.", topic: "Campus life" },
  { text: "If you miss the deadline, you must email the department for a late submission form.", topic: "Campus life" },
  { text: "The orientation session covers everything from meal plans to printing credits.", topic: "Campus life" },
  { text: "Students who commute by bike should register their vehicles with campus security.", topic: "Campus life" },
  // Academics
  { text: "Hand in your essay by noon.", topic: "Academics" },
  { text: "The exam will cover chapters four through seven.", topic: "Academics" },
  { text: "Group projects are graded on both research and presentation.", topic: "Academics" },
  { text: "A good thesis statement makes a clear and arguable claim.", topic: "Academics" },
  { text: "The professor allows one revision for every major assignment.", topic: "Academics" },
  { text: "Citations must follow the style guide listed in the syllabus.", topic: "Academics" },
  { text: "Reading the abstract first helps you decide whether the paper is relevant.", topic: "Academics" },
  { text: "Attendance counts for ten percent of your final grade in this seminar.", topic: "Academics" },
  { text: "Scientific experiments should be repeatable so that others can verify the results.", topic: "Academics" },
  { text: "A strong argument anticipates objections and answers them before the reader raises them.", topic: "Academics" },
  // Technology
  { text: "Remember to save your work often.", topic: "Technology" },
  { text: "The update will install automatically overnight.", topic: "Technology" },
  { text: "Two-step verification protects your account from strangers.", topic: "Technology" },
  { text: "Smartphones have replaced cameras for most casual photographers.", topic: "Technology" },
  { text: "The app stores your settings so you never lose your progress.", topic: "Technology" },
  { text: "Strong passwords mix letters, numbers, and symbols in no obvious order.", topic: "Technology" },
  { text: "Streaming services recommend new shows based on what you watched before.", topic: "Technology" },
  { text: "Many companies now let their employees work remotely a few days a week.", topic: "Technology" },
  { text: "Artificial intelligence can draft a message, but a person should still review it.", topic: "Technology" },
  { text: "Backing up your files to the cloud means a broken phone never costs you your photos.", topic: "Technology" },
  // Environment
  { text: "Turn off the lights when you leave.", topic: "Environment" },
  { text: "Recycling reduces the waste sent to landfills.", topic: "Environment" },
  { text: "Planting trees helps cool crowded city streets.", topic: "Environment" },
  { text: "Public transport lowers the number of cars on the road.", topic: "Environment" },
  { text: "Reusable bottles cut down on single-use plastic every day.", topic: "Environment" },
  { text: "Rising temperatures are melting glaciers faster than scientists expected.", topic: "Environment" },
  { text: "Small daily choices, added up across millions of people, shape the planet.", topic: "Environment" },
  { text: "Farmers are testing new crops that need far less water to grow.", topic: "Environment" },
  { text: "Protecting wetlands guards coastal towns against floods and powerful storms.", topic: "Environment" },
  { text: "Renewable energy from the sun and wind now costs less than many fossil fuels.", topic: "Environment" },
  // Work & career
  { text: "Arrive a few minutes early.", topic: "Work & career" },
  { text: "A clear resume lists your results, not just your duties.", topic: "Work & career" },
  { text: "Good managers give feedback that is specific and kind.", topic: "Work & career" },
  { text: "Networking is simply staying in touch with people you respect.", topic: "Work & career" },
  { text: "Most interviews begin with a short question about yourself.", topic: "Work & career" },
  { text: "Setting clear goals makes it easier to measure your own progress.", topic: "Work & career" },
  { text: "Learning a new skill often matters more than the title on your card.", topic: "Work & career" },
  { text: "A thank-you note after an interview leaves a thoughtful final impression.", topic: "Work & career" },
  { text: "Teams work best when every member understands who is responsible for what.", topic: "Work & career" },
  { text: "The best candidates ask questions that show they researched the company carefully.", topic: "Work & career" },
  // Travel
  { text: "Keep your passport in a safe place.", topic: "Travel" },
  { text: "The train to the airport leaves from platform six.", topic: "Travel" },
  { text: "Booking early usually means a cheaper and better seat.", topic: "Travel" },
  { text: "A light backpack makes a long trip much easier to enjoy.", topic: "Travel" },
  { text: "Learning a few local phrases can turn strangers into helpful friends.", topic: "Travel" },
  { text: "Always check whether your hotel charges extra for breakfast or parking.", topic: "Travel" },
  { text: "Travelling slowly through one region often beats rushing across a whole country.", topic: "Travel" },
  { text: "A photo of your luggage helps enormously if the airline ever loses your bag.", topic: "Travel" },
  { text: "Trying the food that locals eat is one of the best parts of any journey.", topic: "Travel" },
  { text: "Keeping a small notebook of each day lets you relive the trip for years afterward.", topic: "Travel" },
  // Health
  { text: "Drink a glass of water now.", topic: "Health" },
  { text: "A short walk after lunch helps you focus.", topic: "Health" },
  { text: "Sleep repairs both your body and your memory.", topic: "Health" },
  { text: "Stretching before exercise lowers your risk of injury.", topic: "Health" },
  { text: "Eating slowly gives your brain time to notice you are full.", topic: "Health" },
  { text: "Regular exercise improves your mood as much as your fitness.", topic: "Health" },
  { text: "Taking a few deep breaths can calm your nerves before a speech.", topic: "Health" },
  { text: "Spending time outdoors has been shown to reduce everyday stress.", topic: "Health" },
  { text: "A balanced plate includes vegetables, protein, and a sensible portion of grains.", topic: "Health" },
  { text: "Small, steady habits improve your health far more than one dramatic change.", topic: "Health" },
  // Society
  { text: "Everyone deserves a fair chance.", topic: "Society" },
  { text: "Volunteering connects you to your neighbours.", topic: "Society" },
  { text: "Libraries give free knowledge to the whole community.", topic: "Society" },
  { text: "A diverse team brings more ideas to every problem.", topic: "Society" },
  { text: "Clear rules work best when people understand the reasons behind them.", topic: "Society" },
  { text: "Small acts of kindness often matter more than grand public gestures.", topic: "Society" },
  { text: "Good public spaces invite people of every age to gather and relax.", topic: "Society" },
  { text: "Education gives young people the tools to shape their own future.", topic: "Society" },
  { text: "Honest conversation is the first step toward solving a difficult disagreement.", topic: "Society" },
  { text: "A healthy society protects the people who cannot easily protect themselves.", topic: "Society" },
  // Arts & media
  { text: "Turn your phone to silent before the show.", topic: "Arts & media" },
  { text: "A good story makes you care about its characters.", topic: "Arts & media" },
  { text: "Music can change the mood of an entire room.", topic: "Arts & media" },
  { text: "Live theatre feels different every single night.", topic: "Arts & media" },
  { text: "Great photography finds something remarkable in an ordinary scene.", topic: "Arts & media" },
  { text: "Documentaries can teach as much as any classroom when they are honest.", topic: "Arts & media" },
  { text: "A memorable film often lingers in your mind long after the credits roll.", topic: "Arts & media" },
  { text: "Reading fiction lets you live, for a while, inside another person's experience.", topic: "Arts & media" },
  { text: "The best museums explain not only what you see but why it mattered.", topic: "Arts & media" },
  { text: "Painting and drawing teach you to notice the light and shadow everywhere around you.", topic: "Arts & media" },
  // Everyday
  { text: "Could you say that again, please?", topic: "Everyday" },
  { text: "The meeting has been moved to three o'clock.", topic: "Everyday" },
  { text: "I would rather walk than wait for the bus.", topic: "Everyday" },
  { text: "Let me know if you need anything at all.", topic: "Everyday" },
  { text: "Writing a list helps me remember what to buy at the market.", topic: "Everyday" },
  { text: "She promised to call me back as soon as the meeting ended.", topic: "Everyday" },
  { text: "If it rains tomorrow, we will simply move the picnic indoors.", topic: "Everyday" },
  { text: "Cooking at home is usually cheaper and healthier than eating out every night.", topic: "Everyday" },
  { text: "He apologised for being late and explained that the traffic was unusually heavy.", topic: "Everyday" },
  { text: "Whenever I feel overwhelmed, I write down the three most important tasks for the day.", topic: "Everyday" },
  { text: "Thank you for your patience while we fix the problem.", topic: "Everyday" },
  { text: "The package should arrive sometime on Thursday afternoon.", topic: "Everyday" },
];

/** 100+ Take an Interview questions; sample answers are generated from these. */
export const INTERVIEW_ITEMS: RawInterview[] = [
  // Campus life
  { q: "Do you prefer studying alone or with a group? Explain why.", topic: "Campus life" },
  { q: "Describe a place on a campus where you like to study and why it works for you.", topic: "Campus life" },
  { q: "Should universities require students to live on campus in their first year?", topic: "Campus life" },
  { q: "What is one club or activity you would join at a new school, and why?", topic: "Campus life" },
  { q: "How important is it for a university to have modern sports facilities?", topic: "Campus life" },
  { q: "Describe a teacher or mentor who influenced you and explain how.", topic: "Campus life" },
  { q: "Is it better to take many different courses or to specialise early? Why?", topic: "Campus life" },
  { q: "What advice would you give a student who is nervous about starting university?", topic: "Campus life" },
  { q: "Should attendance be required for university lectures? Give your reasons.", topic: "Campus life" },
  { q: "Describe the ideal roommate and explain which qualities matter most to you.", topic: "Campus life" },
  // Academics
  { q: "Do you think exams are a fair way to measure learning? Why or why not?", topic: "Academics" },
  { q: "Describe a subject you find difficult and explain how you deal with it.", topic: "Academics" },
  { q: "Should students be allowed to use the internet during exams?", topic: "Academics" },
  { q: "What is the most useful thing you have ever learned, and why?", topic: "Academics" },
  { q: "Is it better to learn from mistakes or to avoid them entirely? Explain.", topic: "Academics" },
  { q: "Should schools focus more on practical skills or on academic knowledge?", topic: "Academics" },
  { q: "Describe a time you worked hard to understand something new.", topic: "Academics" },
  { q: "Do you prefer lectures or hands-on projects? Give your reasons.", topic: "Academics" },
  { q: "How important is it to learn a second language, and why?", topic: "Academics" },
  { q: "Should homework be reduced so students have more free time?", topic: "Academics" },
  // Technology
  { q: "Has technology made our lives easier or more complicated? Explain.", topic: "Technology" },
  { q: "Describe a piece of technology you could not live without and why.", topic: "Technology" },
  { q: "Should children be given smartphones? Give your reasons.", topic: "Technology" },
  { q: "Do you think social media brings people together or pushes them apart?", topic: "Technology" },
  { q: "How might artificial intelligence change the way we work in the future?", topic: "Technology" },
  { q: "Is it better to read on a screen or on paper? Explain your preference.", topic: "Technology" },
  { q: "Describe an app that changed a habit of yours and explain how.", topic: "Technology" },
  { q: "Should companies be allowed to collect data about their users? Why?", topic: "Technology" },
  { q: "Do you think online learning can fully replace the classroom?", topic: "Technology" },
  { q: "What is one rule you would set for using phones at the dinner table?", topic: "Technology" },
  // Environment
  { q: "What is one simple thing people can do to protect the environment?", topic: "Environment" },
  { q: "Should governments charge more for products that create a lot of waste?", topic: "Environment" },
  { q: "Describe an environmental problem in your area and a possible solution.", topic: "Environment" },
  { q: "Do you think individuals or governments are more responsible for the climate?", topic: "Environment" },
  { q: "Should cities ban cars from their centres to reduce pollution?", topic: "Environment" },
  { q: "Is it worth paying more for products that are better for the planet?", topic: "Environment" },
  { q: "Describe a place in nature that is important to you and explain why.", topic: "Environment" },
  { q: "Should schools teach children about climate change from an early age?", topic: "Environment" },
  { q: "What role can technology play in solving environmental problems?", topic: "Environment" },
  { q: "Would you support a law that bans single-use plastic? Give your reasons.", topic: "Environment" },
  // Work & career
  { q: "What qualities make someone a good leader? Explain with an example.", topic: "Work & career" },
  { q: "Is it better to have a high salary or a job you love? Why?", topic: "Work & career" },
  { q: "Describe a job you would like to have and explain what attracts you to it.", topic: "Work & career" },
  { q: "Should people change careers if they are unhappy at work? Why or why not?", topic: "Work & career" },
  { q: "Do you prefer working in a team or on your own? Explain.", topic: "Work & career" },
  { q: "How important is it to keep learning new skills after you finish school?", topic: "Work & career" },
  { q: "Describe a goal you are working toward and the steps you are taking.", topic: "Work & career" },
  { q: "Should employees be allowed to work from home whenever they want?", topic: "Work & career" },
  { q: "What is the best piece of career advice you have ever received?", topic: "Work & career" },
  { q: "Is money a fair way to measure success? Give your reasons.", topic: "Work & career" },
  // Travel
  { q: "Do you prefer travelling to cities or to the countryside? Why?", topic: "Travel" },
  { q: "Describe a trip that was important to you and explain what made it special.", topic: "Travel" },
  { q: "Is it better to plan a trip carefully or to travel spontaneously?", topic: "Travel" },
  { q: "What can people learn from visiting another country?", topic: "Travel" },
  { q: "Would you rather travel alone or with friends? Explain your choice.", topic: "Travel" },
  { q: "Describe a place you would love to visit and explain why.", topic: "Travel" },
  { q: "Should tourists be expected to learn some of the local language?", topic: "Travel" },
  { q: "Do you think tourism helps or harms the places people visit?", topic: "Travel" },
  { q: "What is one item you always take with you when you travel, and why?", topic: "Travel" },
  { q: "Is it better to revisit a favourite place or to try somewhere new?", topic: "Travel" },
  // Health
  { q: "What do you do to stay healthy, and why does it work for you?", topic: "Health" },
  { q: "Is it better to exercise in the morning or the evening? Explain.", topic: "Health" },
  { q: "Should fast food be taxed to encourage healthier eating?", topic: "Health" },
  { q: "Describe a habit you would like to change and how you plan to do it.", topic: "Health" },
  { q: "How important is sleep for doing well in school or at work?", topic: "Health" },
  { q: "Do you think people rely too much on doctors instead of prevention?", topic: "Health" },
  { q: "What is the best way to deal with stress before an important event?", topic: "Health" },
  { q: "Should schools serve only healthy food in their cafeterias?", topic: "Health" },
  { q: "Describe a sport or activity you enjoy and explain its benefits.", topic: "Health" },
  { q: "Is it better to join a gym or to exercise outdoors? Why?", topic: "Health" },
  // Society
  { q: "What is one change that would improve your community?", topic: "Society" },
  { q: "Should volunteering be a required part of education? Why or why not?", topic: "Society" },
  { q: "Describe someone you admire and explain what makes them admirable.", topic: "Society" },
  { q: "Is it more important to be honest or to be kind? Explain.", topic: "Society" },
  { q: "Should public libraries and museums always be free? Give your reasons.", topic: "Society" },
  { q: "Do you think people today are too focused on money? Explain.", topic: "Society" },
  { q: "What responsibility do wealthy people have toward their communities?", topic: "Society" },
  { q: "Describe a tradition in your culture that you value and why.", topic: "Society" },
  { q: "Should young people be more involved in local decision-making?", topic: "Society" },
  { q: "Is it better to live in a big city or a small town? Why?", topic: "Society" },
  // Arts & media
  { q: "What kind of music do you enjoy, and how does it affect your mood?", topic: "Arts & media" },
  { q: "Describe a book or film that changed the way you think.", topic: "Arts & media" },
  { q: "Should art and music be a required part of school? Why?", topic: "Arts & media" },
  { q: "Do you prefer watching a film at home or at the cinema? Explain.", topic: "Arts & media" },
  { q: "Is it important for a country to protect its traditional arts?", topic: "Arts & media" },
  { q: "Describe a hobby you enjoy and explain why it is meaningful to you.", topic: "Arts & media" },
  { q: "Do you think news should be free for everyone? Give your reasons.", topic: "Arts & media" },
  { q: "What makes a story worth telling, in your opinion?", topic: "Arts & media" },
  { q: "Should museums be allowed to charge for special exhibitions?", topic: "Arts & media" },
  { q: "Describe a performance or concert you remember and why it stayed with you.", topic: "Arts & media" },
  // Everyday
  { q: "How do you usually spend your weekends, and why do you enjoy it?", topic: "Everyday" },
  { q: "Describe your perfect day from morning to night.", topic: "Everyday" },
  { q: "Is it better to save money or to spend it on experiences? Explain.", topic: "Everyday" },
  { q: "What is one skill you would like to learn this year, and why?", topic: "Everyday" },
  { q: "Describe a decision you made recently and how you made it.", topic: "Everyday" },
  { q: "Do you prefer mornings or evenings? Explain your reasons.", topic: "Everyday" },
  { q: "What does a good friendship mean to you?", topic: "Everyday" },
  { q: "Describe something small that always makes you happy.", topic: "Everyday" },
  { q: "Is it better to be early or to be flexible with time? Explain.", topic: "Everyday" },
  { q: "What is a goal you set for yourself and how is it going?", topic: "Everyday" },
  { q: "Describe a meal you love to cook or eat and explain why.", topic: "Everyday" },
  { q: "How do you like to relax after a long and tiring day?", topic: "Everyday" },
];

/** Answer templates taught in Learn (also used to generate sample answers). */
export interface TemplateContent {
  id: string;
  title: string;
  category: "template" | "phrase" | "tip";
  body: string;
}

export const TEMPLATES: TemplateContent[] = [
  { id: "t_opinion", title: "Opinion answer (PREP)", category: "template", body: "Point: State your opinion in one sentence.\nReason: Give your main reason.\nExample: Add a specific example.\nPoint: Restate your opinion briefly." },
  { id: "t_describe", title: "Describe something", category: "template", body: "What it is + one vivid detail.\nWhy it matters to you.\nA short specific memory or example.\nHow it makes you feel." },
  { id: "t_compare", title: "Prefer A or B", category: "template", body: "State your choice clearly.\nGive your strongest reason.\nAcknowledge the other side in one line.\nConclude with a confident summary." },
  { id: "t_agree", title: "Agree / disagree", category: "template", body: "Take a clear side.\nReason one with an example.\nReason two, briefly.\nRestate your position." },
  { id: "p_opening", title: "Strong openings", category: "phrase", body: "In my opinion, ...\nI firmly believe that ...\nFrom my point of view, ...\nThere is no doubt that ..." },
  { id: "p_reason", title: "Giving reasons", category: "phrase", body: "The main reason is that ...\nThis is mainly because ...\nAnother important point is ...\nWhat is more, ..." },
  { id: "p_example", title: "Introducing examples", category: "phrase", body: "For example, ...\nTo give you an example, ...\nIn my own experience, ...\nA good case in point is ..." },
  { id: "p_contrast", title: "Showing contrast", category: "phrase", body: "On the other hand, ...\nHowever, ...\nAlthough some people think ..., I believe ...\nWhile that may be true, ..." },
  { id: "p_conclude", title: "Concluding well", category: "phrase", body: "For these reasons, ...\nAll in all, ...\nThat is why I believe ...\nIn short, ..." },
  { id: "tip_chunk", title: "Repeat: chunk it", category: "tip", body: "Break a long sentence into 2-3 chunks as you listen, then say it back chunk by chunk. Keep a steady pace instead of rushing." },
  { id: "tip_pause", title: "Use pauses, not fillers", category: "tip", body: "A short silent pause sounds far more confident than 'um' or 'like'. Breathe, then continue." },
  { id: "tip_time", title: "Budget your 45 seconds", category: "tip", body: "Spend about 5s on your point, 30s on reasons and examples, and 10s on a clear close." },
];

/** Quick quizzes for the Learn hub (offline). */
export interface QuizContent {
  id: string;
  topic: Topic;
  question: string;
  choices: string[];
  answer: number;
  explain: string;
}

export const QUIZZES: QuizContent[] = [
  { id: "q1", topic: "Academics", question: "Which phrase best opens an opinion answer?", choices: ["Um, maybe...", "In my opinion,", "I don't know but", "Whatever you think"], answer: 1, explain: "A clear stance signals fluency and organization from the first second." },
  { id: "q2", topic: "Academics", question: "What should come right after your main point?", choices: ["A joke", "A reason", "Your name", "Silence"], answer: 1, explain: "Point → Reason → Example → Point keeps answers organised." },
  { id: "q3", topic: "Everyday", question: "A short silent pause is better than...", choices: ["Speaking clearly", "Saying 'um' repeatedly", "Giving an example", "A strong ending"], answer: 1, explain: "Silent pauses read as confidence; repeated fillers lower your fluency score." },
  { id: "q4", topic: "Academics", question: "Roughly how long should an Interview answer be?", choices: ["5 seconds", "45 seconds", "3 minutes", "As long as possible"], answer: 1, explain: "The Interview window is about 45 seconds; use it fully but finish cleanly." },
  { id: "q5", topic: "Technology", question: "Which is a good contrast phrase?", choices: ["For example,", "On the other hand,", "In my opinion,", "The main reason is"], answer: 1, explain: "Contrast words show you can handle both sides of an argument." },
  { id: "q6", topic: "Everyday", question: "In Listen & Repeat, a long sentence is easier if you...", choices: ["Speak as fast as you can", "Break it into chunks", "Skip the hard words", "Whisper it"], answer: 1, explain: "Chunking a sentence into 2-3 parts improves repeat accuracy and pacing." },
  { id: "q7", topic: "Work & career", question: "A strong example in an answer is usually...", choices: ["Vague and general", "Specific and personal", "Copied from a book", "Very long"], answer: 1, explain: "Specific, personal examples raise your language-use and organization scores." },
  { id: "q8", topic: "Academics", question: "Which best concludes an answer?", choices: ["Anyway...", "For these reasons, I believe...", "That's all", "I forgot"], answer: 1, explain: "A short restatement signals a complete, well-organised response." },
  { id: "q9", topic: "Health", question: "Before a speaking test, a good way to calm nerves is to...", choices: ["Hold your breath", "Take a few deep breaths", "Speak very fast", "Skip breakfast"], answer: 1, explain: "Deep breaths steady your pace and your voice." },
  { id: "q10", topic: "Society", question: "If you blank on an idea, it is better to...", choices: ["Stop completely", "Give any clear, simple example", "Change the language", "Repeat the question"], answer: 1, explain: "A simple, relevant example keeps you fluent and on topic." },
];
