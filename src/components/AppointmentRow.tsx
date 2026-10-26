import type { ReactNode } from 'react';
import { formatHour, weekdayShort } from '../data/dates';

type Props = {
  date: Date;
  hour: number;
  service: string;
  /* Segunda línea: "con Carlos M." para el cliente, otra cosa para el barbero. */
  detail: string;
  aside?: ReactNode;
};

export function AppointmentRow({ date, hour, service, detail, aside }: Props) {
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
        <span className="t-detail">{detail}</span>
      </div>
      {aside}
    </div>
  );
}
