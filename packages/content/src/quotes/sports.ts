export interface SportsEntry {
  readonly id: string;
  readonly text: string;
  readonly author: string;
  readonly source: string;
  /** Where the words were said, ending with the year, such as `Yankee Stadium, New York, July 4, 1939`. */
  readonly attested: string;
  readonly enabled?: boolean;
}

export const SPORTS_QUOTES: readonly SportsEntry[] = [
  {
    id: 'ayrton-senna-gap-that-exists',
    text: 'If you no longer go for a gap that exists, you are no longer a racing driver.',
    author: 'Ayrton Senna',
    source: 'Interview with Jackie Stewart, 1990',
    attested: 'Australian Grand Prix, Adelaide, November 1990',
  },
  {
    id: 'bruce-mclaren-measured-in-achievement',
    text: 'To do something well is so worthwhile that to die trying to do it better cannot be foolhardy. It would be a waste of life to do nothing with one’s ability, for I feel that life is measured in achievement, not in years alone.',
    author: 'Bruce McLaren',
    source: 'From the Cockpit, 1964',
    attested: 'From the Cockpit, London, 1964',
  },
  {
    id: 'lou-gehrig-luckiest-man',
    text: 'Today I consider myself the luckiest man on the face of this earth.',
    author: 'Lou Gehrig',
    source: 'Farewell speech, 1939',
    attested: 'Yankee Stadium, New York, July 4, 1939',
  },
  {
    id: 'lou-gehrig-awful-lot-to-live-for',
    text: 'I may have had a tough break, but I have an awful lot to live for.',
    author: 'Lou Gehrig',
    source: 'Farewell speech, 1939',
    attested: 'Yankee Stadium, New York, July 4, 1939',
  },
  {
    id: 'jim-valvano-never-give-up',
    text: 'Don’t give up, don’t ever give up.',
    author: 'Jim Valvano',
    source: 'ESPY Awards speech, 1993',
    attested: 'ESPY Awards, New York, March 4, 1993',
  },
  {
    id: 'jim-valvano-full-day',
    text: 'If you laugh, you think, and you cry, that’s a full day. That’s a heck of a day.',
    author: 'Jim Valvano',
    source: 'ESPY Awards speech, 1993',
    attested: 'ESPY Awards, New York, March 4, 1993',
  },
  {
    id: 'muhammad-ali-float-like-a-butterfly',
    text: 'Float like a butterfly, sting like a bee.',
    author: 'Muhammad Ali',
    source: 'Before fighting Sonny Liston, 1964',
    attested: 'Miami Beach, February 1964',
  },
  {
    id: 'muhammad-ali-free-to-be',
    text: 'I don’t have to be what you want me to be. I’m free to be what I want.',
    author: 'Muhammad Ali',
    source: 'Press conference, 1964',
    attested: 'Miami Beach, February 26, 1964',
  },
  {
    id: 'muhammad-ali-world-at-fifty',
    text: 'The man who views the world at fifty the same as he did at twenty has wasted thirty years of his life.',
    author: 'Muhammad Ali',
    source: 'Playboy interview, 1975',
    attested: 'Playboy, November 1975',
  },
  {
    id: 'michael-jordan-why-i-succeed',
    text: 'I’ve failed over and over and over again in my life. And that is why I succeed.',
    author: 'Michael Jordan',
    source: 'Nike commercial, 1997',
    attested: 'Nike “Failure” commercial, 1997',
  },
  {
    id: 'yogi-berra-aint-over',
    text: 'It ain’t over till it’s over.',
    author: 'Yogi Berra',
    source: 'New York Mets pennant race, 1973',
    attested: 'New York Mets pennant race, July 1973',
  },
  {
    id: 'jackie-robinson-impact-on-other-lives',
    text: 'A life is not important except in the impact it has on other lives.',
    author: 'Jackie Robinson',
    source: 'Epitaph, 1972',
    attested: 'Headstone, Cypress Hills Cemetery, Brooklyn, 1972',
  },
  {
    id: 'billie-jean-king-pressure-is-a-privilege',
    text: 'Pressure is a privilege.',
    author: 'Billie Jean King',
    source: 'Pressure Is a Privilege, 2008',
    attested: 'Pressure Is a Privilege, New York, 2008',
  },
  {
    id: 'babe-ruth-only-real-game',
    text: 'The only real game, I think, in the world is baseball.',
    author: 'Babe Ruth',
    source: 'Babe Ruth Day speech, 1947',
    attested: 'Yankee Stadium, New York, April 27, 1947',
  },
  {
    id: 'joe-dimaggio-making-me-a-yankee',
    text: 'I want to thank the Good Lord for making me a Yankee.',
    author: 'Joe DiMaggio',
    source: 'Joe DiMaggio Day, 1949',
    attested: 'Yankee Stadium, New York, October 1, 1949',
  },
  {
    id: 'satchel-paige-dont-look-back',
    text: 'Don’t look back. Something might be gaining on you.',
    author: 'Satchel Paige',
    source: 'Collier’s, 1953',
    attested: 'Collier’s, June 13, 1953',
  },
  {
    id: 'al-michaels-believe-in-miracles',
    text: 'Do you believe in miracles? Yes!',
    author: 'Al Michaels',
    source: 'Winter Olympics broadcast, 1980',
    attested: 'ABC broadcast, Lake Placid, February 22, 1980',
  },
  {
    id: 'joe-namath-guarantee-it',
    text: 'We’re going to win Sunday. I guarantee it.',
    author: 'Joe Namath',
    source: 'Before Super Bowl III, 1969',
    attested: 'Miami Touchdown Club, January 9, 1969',
  },
  {
    id: 'bill-shankly-more-important-than-that',
    text: 'Some people believe football is a matter of life and death. I am very disappointed with that attitude. I can assure you it is much, much more important than that.',
    author: 'Bill Shankly',
    source: 'Television interview, 1981',
    attested: 'Granada Television, Live from Two, May 1981',
  },
  {
    id: 'eric-cantona-seagulls-follow-the-trawler',
    text: 'When the seagulls follow the trawler, it is because they think sardines will be thrown into the sea.',
    author: 'Eric Cantona',
    source: 'Press conference, 1995',
    attested: 'Croydon, March 31, 1995',
  },
  {
    id: 'kimi-raikkonen-know-what-im-doing',
    text: 'Leave me alone, I know what I’m doing.',
    author: 'Kimi Räikkönen',
    source: 'Team radio, 2012',
    attested: 'Abu Dhabi Grand Prix, Yas Marina, November 4, 2012',
  },
  {
    id: 'kobe-bryant-mamba-out',
    text: 'What can I say? Mamba out.',
    author: 'Kobe Bryant',
    source: 'Farewell speech, 2016',
    attested: 'Staples Center, Los Angeles, April 13, 2016',
  },
  {
    id: 'roger-federer-effortless-is-a-myth',
    text: 'Effortless is a myth.',
    author: 'Roger Federer',
    source: 'Dartmouth commencement address, 2024',
    attested: 'Dartmouth College, Hanover, June 9, 2024',
  },
  {
    id: 'simone-biles-protect-our-mind-and-body',
    text: 'We have to protect our mind and our body, rather than just go out there and do what the world wants us to do.',
    author: 'Simone Biles',
    source: 'Tokyo Olympics, 2021',
    attested: 'Ariake Gymnastics Centre, Tokyo, July 27, 2021',
  },
  {
    id: 'bill-belichick-on-to-cincinnati',
    text: 'We’re on to Cincinnati.',
    author: 'Bill Belichick',
    source: 'Press conference, 2014',
    attested: 'Gillette Stadium, Foxborough, 2014',
  },
];
