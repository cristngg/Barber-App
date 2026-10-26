import type { ReactNode } from 'react';
import { formatHour, weekdayShort } from '../data/dates';

type Props = {
  date: Date;
  hour: number;
  service: string;
  barberName: string;
  aside?: ReactNode;
};

export function AppointmentRow({ date, hour, service, barberName, aside }: Props) {
  return (
    <div className="appt-row">
      <div className="appt-row__date">
        <span className="appt-row__dow">{weekdayShort(date).toUpperCase()}</span>
        <span className="appt-row__day">{date.getDate()}</span>
      </div>
      <div className="appt-row__body">
        <span className="appt-row__title">
          {service} · {formatHour(hour, true)}
        </span>
        <span className="t-detail">con {barberName}</span>
      </div>
      {aside}
    </div>
  );
}
