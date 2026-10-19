export const BIBLE_TRANSLATION = 'World English Bible';

export interface BibleEntry {
  readonly id: string;
  readonly reference: string;
  /** Book, chapter, and verses as written in the eBible.org verse-per-line file, such as `1CO 13:4-7`. */
  readonly passage: string;
  /** An exact, unmodified excerpt of the passage. */
  readonly text: string;
  readonly enabled?: boolean;
}

export const BIBLE_VERSES: readonly BibleEntry[] = [
  {
    id: 'web-numbers-6-24-26',
    reference: 'Numbers 6:24–26',
    passage: 'NUM 6:24-26',
    text: 'Yahweh bless you, and keep you. Yahweh make his face to shine on you, and be gracious to you. Yahweh lift up his face toward you, and give you peace.',
  },
  {
    id: 'web-joshua-1-9',
    reference: 'Joshua 1:9',
    passage: 'JOS 1:9',
    text: 'Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.',
  },
  {
    id: 'web-psalm-16-11',
    reference: 'Psalm 16:11',
    passage: 'PSA 16:11',
    text: 'You will show me the path of life. In your presence is fullness of joy. In your right hand there are pleasures forever more.',
  },
  {
    id: 'web-psalm-23-1',
    reference: 'Psalm 23:1',
    passage: 'PSA 23:1',
    text: 'Yahweh is my shepherd; I shall lack nothing.',
  },
  {
    id: 'web-psalm-30-5',
    reference: 'Psalm 30:5',
    passage: 'PSA 30:5',
    text: 'Weeping may stay for the night, but joy comes in the morning.',
  },
  {
    id: 'web-psalm-46-1',
    reference: 'Psalm 46:1',
    passage: 'PSA 46:1',
    text: 'God is our refuge and strength, a very present help in trouble.',
  },
  {
    id: 'web-psalm-46-10',
    reference: 'Psalm 46:10',
    passage: 'PSA 46:10',
    text: 'Be still, and know that I am God.',
  },
  {
    id: 'web-psalm-118-24',
    reference: 'Psalm 118:24',
    passage: 'PSA 118:24',
    text: 'This is the day that Yahweh has made. We will rejoice and be glad in it!',
  },
  {
    id: 'web-psalm-119-105',
    reference: 'Psalm 119:105',
    passage: 'PSA 119:105',
    text: 'Your word is a lamp to my feet, and a light for my path.',
  },
  {
    id: 'web-psalm-121-1-2',
    reference: 'Psalm 121:1–2',
    passage: 'PSA 121:1-2',
    text: 'I will lift up my eyes to the hills. Where does my help come from? My help comes from Yahweh, who made heaven and earth.',
  },
  {
    id: 'web-proverbs-3-5-6',
    reference: 'Proverbs 3:5–6',
    passage: 'PRO 3:5-6',
    text: 'Trust in Yahweh with all your heart, and don’t lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight.',
  },
  {
    id: 'web-proverbs-4-23',
    reference: 'Proverbs 4:23',
    passage: 'PRO 4:23',
    text: 'Keep your heart with all diligence, for out of it is the wellspring of life.',
  },
  {
    id: 'web-proverbs-15-1',
    reference: 'Proverbs 15:1',
    passage: 'PRO 15:1',
    text: 'A gentle answer turns away wrath, but a harsh word stirs up anger.',
  },
  {
    id: 'web-song-of-solomon-2-11-12',
    reference: 'Song of Solomon 2:11–12',
    passage: 'SOL 2:11-12',
    text: 'For behold, the winter is past. The rain is over and gone. The flowers appear on the earth. The time of the singing has come, and the voice of the turtledove is heard in our land.',
  },
  {
    id: 'web-isaiah-26-3',
    reference: 'Isaiah 26:3',
    passage: 'ISA 26:3',
    text: 'You will keep whoever’s mind is steadfast in perfect peace, because he trusts in you.',
  },
  {
    id: 'web-isaiah-41-10',
    reference: 'Isaiah 41:10',
    passage: 'ISA 41:10',
    text: 'Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.',
  },
  {
    id: 'web-lamentations-3-22-23',
    reference: 'Lamentations 3:22–23',
    passage: 'LAM 3:22-23',
    text: 'It is because of Yahweh’s loving kindnesses that we are not consumed, because his mercies don’t fail. They are new every morning. Great is your faithfulness.',
  },
  {
    id: 'web-micah-6-8',
    reference: 'Micah 6:8',
    passage: 'MIC 6:8',
    text: 'He has shown you, O man, what is good. What does Yahweh require of you, but to act justly, to love mercy, and to walk humbly with your God?',
  },
  {
    id: 'web-zephaniah-3-17',
    reference: 'Zephaniah 3:17',
    passage: 'ZEP 3:17',
    text: 'Yahweh, your God, is among you, a mighty one who will save. He will rejoice over you with joy. He will calm you in his love. He will rejoice over you with singing.',
  },
  {
    id: 'web-matthew-5-9',
    reference: 'Matthew 5:9',
    passage: 'MAT 5:9',
    text: 'Blessed are the peacemakers, for they shall be called children of God.',
  },
  {
    id: 'web-matthew-5-16',
    reference: 'Matthew 5:16',
    passage: 'MAT 5:16',
    text: 'Even so, let your light shine before men, that they may see your good works and glorify your Father who is in heaven.',
  },
  {
    id: 'web-matthew-7-7',
    reference: 'Matthew 7:7',
    passage: 'MAT 7:7',
    text: 'Ask, and it will be given you. Seek, and you will find. Knock, and it will be opened for you.',
  },
  {
    id: 'web-matthew-11-28',
    reference: 'Matthew 11:28',
    passage: 'MAT 11:28',
    text: 'Come to me, all you who labor and are heavily burdened, and I will give you rest.',
  },
  {
    id: 'web-john-13-34',
    reference: 'John 13:34',
    passage: 'JOH 13:34',
    text: 'A new commandment I give to you, that you love one another. Just as I have loved you, you also love one another.',
  },
  {
    id: 'web-john-14-27',
    reference: 'John 14:27',
    passage: 'JOH 14:27',
    text: 'Peace I leave with you. My peace I give to you; not as the world gives, I give to you. Don’t let your heart be troubled, neither let it be fearful.',
  },
  {
    id: 'web-romans-15-13',
    reference: 'Romans 15:13',
    passage: 'ROM 15:13',
    text: 'Now may the God of hope fill you with all joy and peace in believing, that you may abound in hope in the power of the Holy Spirit.',
  },
  {
    id: 'web-1-corinthians-13-4-7',
    reference: '1 Corinthians 13:4–7',
    passage: '1CO 13:4-7',
    text: 'Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud, doesn’t behave itself inappropriately, doesn’t seek its own way, is not provoked, takes no account of evil; doesn’t rejoice in unrighteousness, but rejoices with the truth; bears all things, believes all things, hopes all things, and endures all things.',
  },
  {
    id: 'web-1-corinthians-13-13',
    reference: '1 Corinthians 13:13',
    passage: '1CO 13:13',
    text: 'But now faith, hope, and love remain—these three. The greatest of these is love.',
  },
  {
    id: 'web-galatians-6-9',
    reference: 'Galatians 6:9',
    passage: 'GAL 6:9',
    text: 'Let’s not be weary in doing good, for we will reap in due season if we don’t give up.',
  },
  {
    id: 'web-ephesians-4-32',
    reference: 'Ephesians 4:32',
    passage: 'EPH 4:32',
    text: 'And be kind to one another, tender hearted, forgiving each other, just as God also in Christ forgave you.',
  },
  {
    id: 'web-philippians-4-8',
    reference: 'Philippians 4:8',
    passage: 'PHI 4:8',
    text: 'Finally, brothers, whatever things are true, whatever things are honorable, whatever things are just, whatever things are pure, whatever things are lovely, whatever things are of good report: if there is any virtue and if there is anything worthy of praise, think about these things.',
  },
  {
    id: 'web-1-thessalonians-5-16-18',
    reference: '1 Thessalonians 5:16–18',
    passage: '1TH 5:16-18',
    text: 'Always rejoice. Pray without ceasing. In everything give thanks, for this is the will of God in Christ Jesus toward you.',
  },
];
