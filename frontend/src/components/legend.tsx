/** Legend text stays in text colour; the coloured icon beside it carries the series identity. */
export const legendProps = {
  wrapperStyle: { fontSize: 13 },
  formatter: (value: string) => <span style={{ color: 'var(--text-secondary)' }}>{value}</span>,
}
