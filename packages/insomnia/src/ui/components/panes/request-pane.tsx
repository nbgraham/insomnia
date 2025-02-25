import React, { FC, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouteLoaderData } from 'react-router-dom';
import styled from 'styled-components';

import { getContentTypeFromHeaders } from '../../../common/constants';
import { database } from '../../../common/database';
import * as models from '../../../models';
import { queryAllWorkspaceUrls } from '../../../models/helpers/query-all-workspace-urls';
import { Request } from '../../../models/request';
import { RequestMeta } from '../../../models/request-meta';
import type { Settings } from '../../../models/settings';
import { deconstructQueryStringToParams, extractQueryStringFromUrl } from '../../../utils/url/querystring';
import { useRequestPatcher } from '../../hooks/use-request';
import { useActiveRequestSyncVCSVersion, useGitVCSVersion } from '../../hooks/use-vcs-version';
import { RequestLoaderData } from '../../routes/request';
import { WorkspaceLoaderData } from '../../routes/workspace';
import { PanelContainer, TabItem, Tabs } from '../base/tabs';
import { AuthDropdown } from '../dropdowns/auth-dropdown';
import { ContentTypeDropdown } from '../dropdowns/content-type-dropdown';
import { AuthWrapper } from '../editors/auth/auth-wrapper';
import { BodyEditor } from '../editors/body/body-editor';
import { QueryEditor, QueryEditorContainer, QueryEditorPreview } from '../editors/query-editor';
import { RequestHeadersEditor } from '../editors/request-headers-editor';
import { RequestParametersEditor } from '../editors/request-parameters-editor';
import { ErrorBoundary } from '../error-boundary';
import { MarkdownPreview } from '../markdown-preview';
import { showModal } from '../modals';
import { RequestSettingsModal } from '../modals/request-settings-modal';
import { RenderedQueryString } from '../rendered-query-string';
import { RequestUrlBar, RequestUrlBarHandle } from '../request-url-bar';
import { Pane, PaneHeader } from './pane';
import { PlaceholderRequestPane } from './placeholder-request-pane';
const HeaderContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  height: '100%',
  overflowY: 'auto',
});

export const TabPanelFooter = styled.div({
  boxSizing: 'content-box',
  display: 'flex',
  flexDirection: 'row',
  borderTop: '1px solid var(--hl-md)',
  height: 'var(--line-height-sm)',
  fontSize: 'var(--font-size-sm)',
  '& > button': {
    color: 'var(--hl)',
    padding: 'var(--padding-xs) var(--padding-xs)',
    height: '100%',
  },
});

const TabPanelBody = styled.div({
  overflowY: 'auto',
  flex: '1 0',
});

interface Props {
  environmentId: string;
  settings: Settings;
  setLoading: (l: boolean) => void;
}

export const RequestPane: FC<Props> = ({
  environmentId,
  settings,
  setLoading,
}) => {
  const { activeRequest, activeRequestMeta } = useRouteLoaderData('request/:requestId') as RequestLoaderData<Request, RequestMeta>;
  const { workspaceId, requestId } = useParams() as { organizationId: string; projectId: string; workspaceId: string; requestId: string };
  const patchRequest = useRequestPatcher();

  const handleEditDescription = useCallback((forceEditMode: boolean) => {
    showModal(RequestSettingsModal, { request: activeRequest, forceEditMode });
  }, [activeRequest]);

  const handleEditDescriptionAdd = useCallback(() => {
    handleEditDescription(true);
  }, [handleEditDescription]);

  const handleUpdateSettingsUseBulkHeaderEditor = useCallback(() => {
    models.settings.update(settings, { useBulkHeaderEditor: !settings.useBulkHeaderEditor });
  }, [settings]);

  const handleUpdateSettingsUseBulkParametersEditor = useCallback(() => {
    models.settings.update(settings, { useBulkParametersEditor: !settings.useBulkParametersEditor });
  }, [settings]);

  const handleImportQueryFromUrl = useCallback(() => {
    let query;

    try {
      query = extractQueryStringFromUrl(activeRequest.url);
    } catch (error) {
      console.warn('Failed to parse url to import querystring');
      return;
    }

    // Remove the search string (?foo=bar&...) from the Url
    const url = activeRequest.url.replace(`?${query}`, '');
    const parameters = [...activeRequest.parameters, ...deconstructQueryStringToParams(query)];

    // Only update if url changed
    if (url !== activeRequest.url) {
      database.update({
        ...activeRequest,
        modified: Date.now(),
        url,
        parameters,
        // Hack to force the ui to refresh. More info on use-vcs-version
      }, true);
    }
  }, [activeRequest]);
  const gitVersion = useGitVCSVersion();
  const activeRequestSyncVersion = useActiveRequestSyncVCSVersion();

  const {
    activeEnvironment,
  } = useRouteLoaderData(':workspaceId') as WorkspaceLoaderData;
  // Force re-render when we switch requests, the environment gets modified, or the (Git|Sync)VCS version changes
  const uniqueKey = `${activeEnvironment?.modified}::${requestId}::${gitVersion}::${activeRequestSyncVersion}::${activeRequestMeta?.activeResponseId}`;

  const requestUrlBarRef = useRef<RequestUrlBarHandle>(null);
  useEffect(() => {
    requestUrlBarRef.current?.focusInput();
  }, [
    requestId, // happens when the user switches requests
    uniqueKey,
  ]);

  if (!activeRequest) {
    return (
      <PlaceholderRequestPane />
    );
  }

  const numParameters = activeRequest.parameters.filter(p => !p.disabled).length;
  const numHeaders = activeRequest.headers.filter(h => !h.disabled).length;
  const urlHasQueryParameters = activeRequest.url.indexOf('?') >= 0;
  const contentType = getContentTypeFromHeaders(activeRequest.headers) || activeRequest.body.mimeType;
  return (
    <Pane type="request">
      <PaneHeader>
        <ErrorBoundary errorClassName="font-error pad text-center">
          <RequestUrlBar
            key={requestId}
            ref={requestUrlBarRef}
            uniquenessKey={uniqueKey}
            onUrlChange={url => patchRequest(requestId, { url })}
            handleAutocompleteUrls={() => queryAllWorkspaceUrls(workspaceId, models.request.type, requestId)}
            nunjucksPowerUserMode={settings.nunjucksPowerUserMode}
            setLoading={setLoading}
          />
        </ErrorBoundary>
      </PaneHeader>
      <Tabs aria-label="Request pane tabs">
        <TabItem key="content-type" title={<ContentTypeDropdown />}>
          <BodyEditor
            key={uniqueKey}
            request={activeRequest}
            environmentId={environmentId}
          />
        </TabItem>
        <TabItem key="auth" title={<AuthDropdown />}>
          <ErrorBoundary key={uniqueKey} errorClassName="font-error pad text-center">
            <AuthWrapper />
          </ErrorBoundary>
        </TabItem>
        <TabItem key="query" title={<>Query {numParameters > 0 && <span className="bubble space-left">{numParameters}</span>}</>}>
          <QueryEditorContainer>
            <QueryEditorPreview className="pad pad-bottom-sm">
              <label className="label--small no-pad-top">Url Preview</label>
              <code className="txt-sm block faint">
                <ErrorBoundary
                  key={uniqueKey}
                  errorClassName="tall wide vertically-align font-error pad text-center"
                >
                  <RenderedQueryString request={activeRequest} />
                </ErrorBoundary>
              </code>
            </QueryEditorPreview>
            <QueryEditor>
              <ErrorBoundary
                key={uniqueKey}
                errorClassName="tall wide vertically-align font-error pad text-center"
              >
                <RequestParametersEditor
                  key={contentType}
                  bulk={settings.useBulkParametersEditor}
                />
              </ErrorBoundary>
            </QueryEditor>
            <TabPanelFooter>
              <button
                className="btn btn--compact"
                title={urlHasQueryParameters ? 'Import querystring' : 'No query params to import'}
                onClick={handleImportQueryFromUrl}
              >
                Import from URL
              </button>
              <button
                className="btn btn--compact"
                onClick={handleUpdateSettingsUseBulkParametersEditor}
              >
                {settings.useBulkParametersEditor ? 'Regular Edit' : 'Bulk Edit'}
              </button>
            </TabPanelFooter>
          </QueryEditorContainer>
        </TabItem>
        <TabItem key="headers" title={<>Headers {numHeaders > 0 && <span className="bubble space-left">{numHeaders}</span>}</>}>
          <HeaderContainer>
            <ErrorBoundary key={uniqueKey} errorClassName="font-error pad text-center">
              <TabPanelBody>
                <RequestHeadersEditor
                  bulk={settings.useBulkHeaderEditor}
                />
              </TabPanelBody>
            </ErrorBoundary>

            <TabPanelFooter>
              <button
                className="btn btn--compact"
                onClick={handleUpdateSettingsUseBulkHeaderEditor}
              >
                {settings.useBulkHeaderEditor ? 'Regular Edit' : 'Bulk Edit'}
              </button>
            </TabPanelFooter>
          </HeaderContainer>
        </TabItem>
        <TabItem
          key="docs"
          title={
            <>
              Docs
              {activeRequest.description && (
                <span className="bubble space-left">
                  <i className="fa fa--skinny fa-check txt-xxs" />
                </span>
              )}
            </>
          }
        >
          <PanelContainer className="tall">
            {activeRequest.description ? (
              <div>
                <div className="pull-right pad bg-default">
                  {/* @ts-expect-error -- TSCONVERSION the click handler expects a boolean prop... */}
                  <button className="btn btn--clicky" onClick={handleEditDescription}>
                    Edit
                  </button>
                </div>
                <div className="pad">
                  <ErrorBoundary errorClassName="font-error pad text-center">
                    <MarkdownPreview
                      heading={activeRequest.name}
                      markdown={activeRequest.description}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden editor vertically-center text-center">
                <p className="pad text-sm text-center">
                  <span className="super-faint">
                    <i
                      className="fa fa-file-text-o"
                      style={{
                        fontSize: '8rem',
                        opacity: 0.3,
                      }}
                    />
                  </span>
                  <br />
                  <br />
                  <button
                    className="btn btn--clicky faint"
                    onClick={handleEditDescriptionAdd}
                  >
                    Add Description
                  </button>
                </p>
              </div>
            )}
          </PanelContainer>
        </TabItem>
      </Tabs>
    </Pane>
  );
};
