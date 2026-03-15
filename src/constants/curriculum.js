export const TOPICS = [
  {
    title: 'Personal Introduction',
    goal: 'Learn to say your name, age, hometown, and current job.',
    prompt: 'Focus on "I am", "I live in", and "I work as".',
    welcome: 'Hello! Let\'s start with the basics. Can you introduce yourself?'
  },
  {
    title: 'Daily Routine',
    goal: 'Talk about your typical day using the Present Simple.',
    prompt: 'Focus on time expressions like "at 7 AM" and verbs like "wake up", "eat", and "go to work".',
    welcome: 'Good to see you again! Today, tell me about your day. What is the first thing you do in the morning?'
  },
  {
    title: 'Hobbies & Interests',
    goal: 'Express likes and dislikes about free time activities.',
    prompt: 'Focus on "I like", "I love", "I don\'t like", and "Because".',
    welcome: 'What do you do for fun? Let\'s talk about your hobbies!'
  },
  {
    title: 'Food & Restaurants',
    goal: 'Practice ordering food and talking about preferences.',
    prompt: 'Focus on "I would like", "Can I have", and describing flavors.',
    welcome: 'I\'m hungry! Let\'s pretend we are at a restaurant. What would you like to eat?'
  },
  {
    title: 'Travel & Vacations',
    goal: 'Talk about past trips or dream destinations.',
    prompt: 'Focus on "I want to visit", "I went to", and travel vocabulary (airport, beach, hotel).',
    welcome: 'Close your eyes! If you could travel anywhere right now, where would you go?'
  }
];

export const getTopicByXP = (xp) => {
  // Simple logic: one topic every 100 XP
  const index = Math.floor(xp / 100);
  return TOPICS[Math.min(index, TOPICS.length - 1)];
};
