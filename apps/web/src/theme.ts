/** US-edition theme — only place for display names, colors, currency. */
export const theme = {
  currencySymbol: '$',
  currencySuffix: 'M',
  formatMoney(amount: number): string {
    return `$${amount}M`;
  },
  propertyNames: {
    brown: 'Brown',
    light_blue: 'Light Blue',
    pink: 'Purple',
    orange: 'Orange',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    dark_blue: 'Dark Blue',
    railroad: 'Railroad',
    utility: 'Utility',
  } as Record<string, string>,
  propertyColors: {
    brown: '#8B5E3C',
    light_blue: '#AEDCF0',
    pink: '#D93C96',
    orange: '#F0A23C',
    red: '#E03B2F',
    yellow: '#F2D22E',
    green: '#1FA85A',
    dark_blue: '#1F72C4',
    railroad: '#2E2A26',
    utility: '#A8B0A0',
  } as Record<string, string>,
  actionNames: {
    pass_go: 'Pass Go',
    deal_breaker: 'Deal Breaker',
    sly_deal: 'Sly Deal',
    forced_deal: 'Forced Deal',
    debt_collector: 'Debt Collector',
    its_my_birthday: "It's My Birthday",
    just_say_no: 'Just Say No',
    double_the_rent: 'Double the Rent',
    house: 'House',
    hotel: 'Hotel',
  } as Record<string, string>,
  playerNames: ['You', 'Priya', 'Marcus', 'Yuki', 'Alex'] as string[],
  seatName(index: number, isLocal: boolean): string {
    if (isLocal) return 'You';
    return this.playerNames[index] ?? `Player ${index + 1}`;
  },
};
