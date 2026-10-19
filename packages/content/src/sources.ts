/**
 * Primary texts the collection is quoted from. Every quote names one of these, and
 * `bun run content:verify-sources` downloads each text and checks the quote against it.
 */
export type SourceFormat = 'text' | 'html' | 'ebible-vpl-zip';

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
  'gutenberg-45': { title: 'Anne of Green Gables', url: gutenberg(45), format: 'text' },
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
  'gutenberg-514': { title: 'Little Women', url: gutenberg(514), format: 'text' },
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
  'gutenberg-1365': {
    title: 'The Complete Poetical Works of Henry Wadsworth Longfellow',
    url: gutenberg(1365),
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
  'gutenberg-2944': { title: 'Essays: First Series', url: gutenberg(2944), format: 'text' },
  'gutenberg-3330': {
    title: 'The Analects of Confucius',
    translator: 'James Legge',
    url: gutenberg(3330),
    format: 'text',
  },
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
} as const satisfies Record<string, SourceText>;

export type SourceId = keyof typeof SOURCES;
