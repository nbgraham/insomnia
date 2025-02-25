import React, { ChangeEventHandler, PropsWithChildren, ReactNode, useCallback } from 'react';
import { useRouteLoaderData } from 'react-router-dom';

import { SettingsOfType } from '../../../common/settings';
import * as models from '../../../models/index';
import { RootLoaderData } from '../../routes/root';
import { HelpTooltip } from '../help-tooltip';
interface Props<T> {
  help?: ReactNode;
  label: string;
  setting: SettingsOfType<string>;
  values: {
    name: string;
    value: T;
  }[];
}

export const EnumSetting = <T extends string | number>({
  help,
  label,
  setting,
  values,
}: PropsWithChildren<Props<T>>) => {
  const {
    settings,
  } = useRouteLoaderData('root') as RootLoaderData;

  const onChange = useCallback<ChangeEventHandler<HTMLSelectElement>>(async ({ currentTarget: { value } }) => {
    await models.settings.patch({ [setting]: value });
  }, [setting]);

  return (
    <div className="form-control form-control--outlined">
      <label>
        {label}
        {help && <HelpTooltip className="space-left">{help}</HelpTooltip>}
        <select
          value={String(settings[setting]) || '__NULL__'}
          name={setting}
          onChange={onChange}
        >
          {values.map(({ name, value }) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
