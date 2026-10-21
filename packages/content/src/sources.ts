export type SourceFormat = 'text' | 'html' | 'ebible-vpl-zip' | 'film-clip';

export interface SourceText {
  readonly title: string;
  readonly url: string;
  readonly format: SourceFormat;
  readonly translator?: string;
}

const gutenberg = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
const senecaLetter = (letter: number) =>
  `https://en.wikisource.org/w/index.php?title=Moral_letters_to_Lucilius/Letter_${letter}&action=render`;
const seneca = (letter: number): SourceText => ({
  title: `Moral Letters to Lucilius, Letter ${letter}`,
  translator: 'Richard Mott Gummere (1917–1925)',
  url: senecaLetter(letter),
  format: 'html',
});

const film = (title: string, path: string): SourceText => ({
  title: `${title}, English scene captions`,
  url: `https://clip.cafe/${path}/`,
  format: 'film-clip',
});

export const SOURCES = {
  'world-english-bible': {
    title: 'World English Bible (2020 stable text, eBible.org)',
    url: 'https://eBible.org/Scriptures/eng-web_vpl.zip',
    format: 'ebible-vpl-zip',
  },
  'seneca-letter-1': seneca(1),
  'seneca-letter-2': seneca(2),
  'seneca-letter-7': seneca(7),
  'seneca-letter-13': seneca(13),
  'seneca-letter-101': seneca(101),
  'gutenberg-11': { title: 'Alice’s Adventures in Wonderland', url: gutenberg(11), format: 'text' },
  'gutenberg-12': { title: 'Through the Looking-Glass', url: gutenberg(12), format: 'text' },
  'gutenberg-23': {
    title: 'Narrative of the Life of Frederick Douglass, an American Slave',
    url: gutenberg(23),
    format: 'text',
  },
  'gutenberg-45': { title: 'Anne of Green Gables', url: gutenberg(45), format: 'text' },
  'gutenberg-84': { title: 'Frankenstein', url: gutenberg(84), format: 'text' },
  'gutenberg-100': {
    title: 'The Complete Works of William Shakespeare',
    url: gutenberg(100),
    format: 'text',
  },
  'gutenberg-102': {
    title: 'The Tragedy of Pudd’nhead Wilson',
    url: gutenberg(102),
    format: 'text',
  },
  'gutenberg-113': { title: 'The Secret Garden', url: gutenberg(113), format: 'text' },
  'gutenberg-135': {
    title: 'Les Misérables',
    translator: 'Isabel F. Hapgood (1887)',
    url: gutenberg(135),
    format: 'text',
  },
  'gutenberg-136': { title: 'A Child’s Garden of Verses', url: gutenberg(136), format: 'text' },
  'gutenberg-141': { title: 'Mansfield Park', url: gutenberg(141), format: 'text' },
  'gutenberg-145': { title: 'Middlemarch', url: gutenberg(145), format: 'text' },
  'gutenberg-158': { title: 'Emma', url: gutenberg(158), format: 'text' },
  'gutenberg-205': { title: 'Walden', url: gutenberg(205), format: 'text' },
  'gutenberg-216': {
    title: 'The Tao Teh King',
    translator: 'James Legge (1891)',
    url: gutenberg(216),
    format: 'text',
  },
  'gutenberg-289': { title: 'The Wind in the Willows', url: gutenberg(289), format: 'text' },
  'gutenberg-326': { title: 'Steep Trails', url: gutenberg(326), format: 'text' },
  'gutenberg-386': {
    title: 'Virginibus Puerisque, and Other Papers',
    url: gutenberg(386),
    format: 'text',
  },
  'gutenberg-514': { title: 'Little Women', url: gutenberg(514), format: 'text' },
  'gutenberg-556': { title: 'Rewards and Fairies', url: gutenberg(556), format: 'text' },
  'gutenberg-652': { title: 'Rasselas, Prince of Abyssinia', url: gutenberg(652), format: 'text' },
  'gutenberg-790': { title: 'Lady Windermere’s Fan', url: gutenberg(790), format: 'text' },
  'gutenberg-882': { title: 'Sketches by Boz', url: gutenberg(882), format: 'text' },
  'gutenberg-1228': {
    title: 'On the Origin of Species (1859)',
    url: gutenberg(1228),
    format: 'text',
  },
  'gutenberg-1260': { title: 'Jane Eyre', url: gutenberg(1260), format: 'text' },
  'gutenberg-1322': { title: 'Leaves of Grass', url: gutenberg(1322), format: 'text' },
  'gutenberg-1342': { title: 'Pride and Prejudice', url: gutenberg(1342), format: 'text' },
  'gutenberg-1365': {
    title: 'The Complete Poetical Works of Henry Wadsworth Longfellow',
    url: gutenberg(1365),
    format: 'text',
  },
  'gutenberg-1568': {
    title: 'Poems (William Ernest Henley)',
    url: gutenberg(1568),
    format: 'text',
  },
  'gutenberg-1656': {
    title: 'Apology',
    translator: 'Benjamin Jowett',
    url: gutenberg(1656),
    format: 'text',
  },
  'gutenberg-2002': { title: 'Sonnets from the Portuguese', url: gutenberg(2002), format: 'text' },
  'gutenberg-2017': {
    title: 'The Dhammapada',
    translator: 'F. Max Müller (1881)',
    url: gutenberg(2017),
    format: 'text',
  },
  'gutenberg-2376': { title: 'Up from Slavery', url: gutenberg(2376), format: 'text' },
  'gutenberg-2397': { title: 'The Story of My Life', url: gutenberg(2397), format: 'text' },
  'gutenberg-2428': { title: 'An Essay on Man', url: gutenberg(2428), format: 'text' },
  'gutenberg-2600': {
    title: 'War and Peace',
    translator: 'Louise and Aylmer Maude',
    url: gutenberg(2600),
    format: 'text',
  },
  'gutenberg-2895': {
    title: 'Following the Equator: A Journey Around the World',
    url: gutenberg(2895),
    format: 'text',
  },
  'gutenberg-2944': { title: 'Essays: First Series', url: gutenberg(2944), format: 'text' },
  'gutenberg-3176': { title: 'The Innocents Abroad', url: gutenberg(3176), format: 'text' },
  'gutenberg-3330': {
    title: 'The Analects of Confucius',
    translator: 'James Legge',
    url: gutenberg(3330),
    format: 'text',
  },
  'gutenberg-4507': { title: 'As a Man Thinketh', url: gutenberg(4507), format: 'text' },
  'gutenberg-4800': {
    title: 'The Complete Poetical Works of Percy Bysshe Shelley',
    url: gutenberg(4800),
    format: 'text',
  },
  'gutenberg-6524': { title: 'Stray Birds', url: gutenberg(6524), format: 'text' },
  'gutenberg-7409': { title: 'An Essay on Criticism', url: gutenberg(7409), format: 'text' },
  'gutenberg-8438': {
    title: 'The Nicomachean Ethics',
    translator: 'D. P. Chase',
    url: gutenberg(8438),
    format: 'text',
  },
  'gutenberg-8601': {
    title: 'The Early Poems of Alfred Lord Tennyson',
    url: gutenberg(8601),
    format: 'text',
  },
  'gutenberg-9622': { title: 'Lyrical Ballads (1798)', url: gutenberg(9622), format: 'text' },
  'gutenberg-12242': {
    title: 'Poems by Emily Dickinson, Three Series',
    url: gutenberg(12242),
    format: 'text',
  },
  'gutenberg-13930': {
    title: 'African and European Addresses',
    url: gutenberg(13930),
    format: 'text',
  },
  'gutenberg-15877': {
    title: 'Thoughts of Marcus Aurelius Antoninus',
    translator: 'George Long',
    url: gutenberg(15877),
    format: 'text',
  },
  'gutenberg-17393': { title: 'Men and Women', url: gutenberg(17393), format: 'text' },
  'gutenberg-23772': {
    title: 'Devotions upon Emergent Occasions',
    url: gutenberg(23772),
    format: 'text',
  },
  'gutenberg-24280': { title: 'Endymion', url: gutenberg(24280), format: 'text' },
  'gutenberg-31622': { title: 'Optimism: An Essay', url: gutenberg(31622), format: 'text' },
  'gutenberg-35698': {
    title: 'Letters of John Keats to His Family and Friends',
    url: gutenberg(35698),
    format: 'text',
  },
  'gutenberg-36483': {
    title: 'Wilhelm Meister’s Apprenticeship and Travels, vol. 1',
    translator: 'Thomas Carlyle',
    url: gutenberg(36483),
    format: 'text',
  },
  'gutenberg-43855': { title: 'Franklin’s Way to Wealth', url: gutenberg(43855), format: 'text' },
  'gutenberg-45109': {
    title: 'The Enchiridion',
    translator: 'Thomas Wentworth Higginson',
    url: gutenberg(45109),
    format: 'text',
  },
  'gutenberg-52958': {
    title: 'Revelations of Divine Love',
    translator: 'Modern English version edited by Grace Warrack (1901)',
    url: gutenberg(52958),
    format: 'text',
  },
  'gutenberg-58585': { title: 'The Prophet', url: gutenberg(58585), format: 'text' },
  'gutenberg-69258': { title: 'Society and Solitude', url: gutenberg(69258), format: 'text' },
  'gutenberg-69617': {
    title: 'Pierre Curie (1923)',
    translator: 'Charlotte and Vernon Kellogg',
    url: gutenberg(69617),
    format: 'text',
  },
  'gutenberg-70950': { title: 'In Memoriam', url: gutenberg(70950), format: 'text' },
  'film-gladiator-echoes': film(
    'Gladiator (2000)',
    'gladiator-2000/three-weeks-from-now-i-will-be-harvesting-crops',
  ),
  'film-rocky-keep-moving': film(
    'Rocky Balboa (2006)',
    'rocky-balboa-2006/saying-aint-you-wanna-be-of-him-her-anybody',
  ),
  'film-batman-what-you-do': film(
    'Batman Begins (2005)',
    'batman-begins-2005/deep-down-may-still-be-same-great-kid-used-be-s1',
  ),
  'film-dark-knight-dawn': film(
    'The Dark Knight (2008)',
    'the-dark-knight-2008/but-the-night-is-darkest-just-before-the-dawn-and-i-promise-you-the-dawn-is-coming',
  ),
  'film-shawshank-living': film(
    'The Shawshank Redemption (1994)',
    'the-shawshank-redemption-1994/or-get-busy-dying',
  ),
  'film-good-will-hunting-fault': film(
    'Good Will Hunting (1997)',
    'good-will-hunting-1997/its-not-your-fault-s2',
  ),
  'film-dead-poets-words': film(
    'Dead Poets Society (1989)',
    'dead-poets-society-1989/no-matter-what-anybody-tells-words-ideas-can-change-the-world',
  ),
  'film-truman-my-head': film(
    'The Truman Show (1998)',
    'the-truman-show-1998/i-know-better-than-do-you-never-a-camera-in-head',
  ),
  'film-forrest-chocolates': film(
    'Forrest Gump (1994)',
    'forrest-gump-1994/life-like-a-box-of-chocolates',
  ),
  'film-princess-bride-life': film(
    'The Princess Bride (1987)',
    'the-princess-bride-1987/you-mock-pain',
  ),
  'film-back-to-future-mind': film(
    'Back to the Future (1985)',
    'back-the-future-1985/if-put-mind-it-s1',
  ),
  'film-matrix-door': film(
    'The Matrix (1999)',
    'the-matrix-1999/i-told-you-i-can-only-show-you-the-door-you-have-to-walk-through-it',
  ),
  'film-inception-dream-bigger': film(
    'Inception (2010)',
    'inception-2010/you-mustnt-be-afraid-dream-a-little-bigger',
  ),
  'film-interstellar-love': film(
    'Interstellar (2014)',
    'interstellar-2014/love-is-the-one-thing-were-capable-of-perceivingthat-transcends-dimensions-of-time-and-space',
  ),
  'film-fellowship-smallest': film(
    'The Lord of the Rings: The Fellowship of the Ring (2001)',
    'the-lord-of-the-rings-the-fellowship-of-the-ring-2001/even-the-smallest-person-can-change-the-course-of-the-future',
  ),
  'film-two-towers-good': film(
    'The Lord of the Rings: The Two Towers (2002)',
    'the-lord-of-the-rings-the-two-towers-2002/that-theres-some-good-in-world-mr-frodo',
  ),
  'film-return-of-king-carry': film(
    'The Lord of the Rings: The Return of the King (2003)',
    'the-lord-of-the-rings-the-return-of-the-king-2003/i-cant-carry-it-you',
  ),
  'film-empire-do': film(
    'Star Wars: The Empire Strikes Back (1980)',
    'star-wars-episode-v-the-empire-strikes-back-1980/all-right-ill-give-a-try-try-not',
  ),
  'film-new-hope-fool': film(
    'Star Wars: A New Hope (1977)',
    'star-wars-episode-iv-a-new-hope-1977/boy-its-lucky-you-these-compartments',
  ),
  'film-nemo-swimming': film('Finding Nemo (2003)', 'finding-nemo-2003/what-do-do-s7'),
  'film-toy-story-infinity': film('Toy Story (1995)', 'toy-story-1995/to-infinity-beyond-s6'),
  'film-up-adventure': film('Up (2009)', 'up-2009/adventure-out-there'),
  'film-ratatouille-artist': film('Ratatouille (2007)', 'ratatouille-2007/get-lawyer-s1'),
  'film-kung-fu-panda-present': film(
    'Kung Fu Panda (2008)',
    'kung-fu-panda-2008/yesterday-history',
  ),
  'film-lion-king-learn': film(
    'The Lion King (1994)',
    'the-lion-king-1994/i-know-what-i-have-to-do-but-going-back-means-ill-have-to-face-my-pastive-been-running-from-it-for',
  ),
} as const satisfies Record<string, SourceText>;

export type SourceId = keyof typeof SOURCES;
