const TONE = {
  Active: 'g', Paid: 'g', Open: 'g', Completed: 'g', Present: 'g',
  Suspended: 'r', Unpaid: 'r', Absent: 'r',
  Partial: 'y', 'On leave': 'y', Scheduled: 'y', Inactive: 'y', Late: 'y', Excused: 'y'
};

export const Badge = ({ v }) => <span className={'bd ' + (TONE[v] || '')}>{v}</span>;
