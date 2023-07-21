import React, { FC, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useFetcher, useParams, useRouteLoaderData } from 'react-router-dom';

import type { Environment } from '../../../models/environment';
import { useNunjucks } from '../../context/nunjucks/use-nunjucks';
import { WorkspaceLoaderData } from '../../routes/workspace';
import { createKeybindingsHandler } from '../keydown-binder';

interface Props {
  defaultValue: string;
  onChange: Function;
}

export const VariableEditor: FC<Props> = ({ onChange, defaultValue }) => {
  const { handleRender, handleGetRenderContext } = useNunjucks();
  const [selected, setSelected] = useState(defaultValue);
  const [options, setOptions] = useState<{ name: string; value: any }[]>([]);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  const { organizationId, projectId, workspaceId } = useParams<{ organizationId: string; projectId: string; workspaceId: string }>();
  const updateEnvironmentFetcher = useFetcher();
  const updateEnvironment = async (environmentId: string, patch: Partial<Environment>) => {
    updateEnvironmentFetcher.submit({
      patch,
      environmentId,
    },
    {
      encType: 'application/json',
      method: 'post',
      action: `/organization/${organizationId}/project/${projectId}/workspace/${workspaceId}/environment/update`,
    });
  };

  const routeData = useRouteLoaderData(
    ':workspaceId'
  ) as WorkspaceLoaderData;

  const {
    activeEnvironment,
  } = routeData;

  const [edits, incrementEdits] = useReducer((state: number) => state + 1, 0);
  useEffect(() => {
    let isMounted = true;
    const syncInterpolation = async () => {
      try {
        const p = await handleRender(selected);
        isMounted && setPreview(p);
        isMounted && setError('');
      } catch (e) {
        isMounted && setPreview('');
        isMounted && setError(e.message);
      }
      const context = await handleGetRenderContext();
      isMounted && setOptions(context.keys.sort((a, b) => (a.name < b.name ? -1 : 1)));
    };
    syncInterpolation();
    return () => {
      isMounted = false;
    };
  }, [handleGetRenderContext, handleRender, selected, edits]);

  const isCustomTemplateSelected = !options.find(v => selected === `{{ ${v.name} }}`);

  const inputRef = useRef<HTMLInputElement>(null);

  const updateKey = useMemo(() => {
    if (isCustomTemplateSelected) {
      return null;
    }
    const withoutBraces = selected.substring(3, selected.length - 3);
    if (!withoutBraces.startsWith('_.')) {
      console.warn(`Key must start with '_.': ${withoutBraces}`);
      return;
    }
    const withoutPrefix = withoutBraces.substring(2);
    const key = withoutPrefix.split('.');
    if (key.length === 0) {
      return null;
    }
    return key;
  }, [isCustomTemplateSelected, selected]);

  const updateVariable = async (key: string[], newValue: string) => {
    if (newValue === preview) {
      return;
    }

    const keyCopy = [...key];
    const first = keyCopy.pop();
    if (!first) {
      return;
    }
    let data: Record<string, any> = { [first]: newValue };
    while (keyCopy.length > 0) {
      const key = keyCopy.pop();
      if (!key) {
        break;
      }
      data = { [key]: data };
    }

    // TODO: This is _replacing_ the environment, removing all existing values
    await updateEnvironment(activeEnvironment._id, {
      data: data,
    });
  };

  return (
    <div>
      <div className="form-control form-control--outlined">
        <label>
          Environment Variable
          <select
            value={selected}
            onChange={event => {
              setSelected(event.target.value);
              onChange(event.target.value);
            }}
          >
            <option value={"{{ 'my custom template logic' | urlencode }}"}>-- Custom --</option>
            {options.map(v => (
              <option key={v.name} value={`{{ ${v.name} }}`}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isCustomTemplateSelected && (
        <div className="form-control form-control--outlined">
          <input
            type="text"
            defaultValue={selected}
            onChange={event => {
              setSelected(event.target.value);
              onChange(event.target.value);
            }}
          />
        </div>
      )}
      <div className="form-control form-control--outlined">
        <label>
          Live Preview
          <textarea className={`${error ? 'danger' : ''}`} value={preview || error} readOnly />
        </label>
      </div>
      {updateKey && (
        <div className="form-control form-control--outlined">
          <label>
            Update value (Enter to save)
            <input
              ref={inputRef}
              type="text"
              title="Update value"
              onKeyDown={createKeybindingsHandler({
                'Enter': e => {
                  e.stopPropagation();
                  e.preventDefault();
                  const newValue = inputRef.current?.value;
                  if (newValue) {
                    updateVariable(updateKey, newValue).then(() => {
                      setTimeout(() => incrementEdits());
                    });
                  }
                },
              })}
            />
          </label>
        </div>
      )}
    </div>
  );
};
