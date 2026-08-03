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
    pink: 'Pink',
    orange: 'Orange',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    dark_blue: 'Dark Blue',
    railroad: 'Railroad',
    utility: 'Utility',
  } as Record<string, string>,
  propertyColors: {
    brown: '#8B4513',
    light_blue: '#AAE0FA',
    pink: '#C94E8B',
    orange: '#F59B1A',
    red: '#D32F2F',
    yellow: '#FCE014',
    green: '#1B8A3C',
    dark_blue: '#1A3A6E',
    railroad: '#222222',
    utility: '#C4C4C4',
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
};
