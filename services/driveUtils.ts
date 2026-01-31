import { fileToBase64 } from "./geminiService";

// Dynamic configuration variables
let configuredClientId = '';
let configuredAppId = ''; // Project Number extracted from Client ID

// We reuse the Gemini API Key as the Developer Key for the Picker API
const DEVELOPER_KEY = process.env.API_KEY || ''; 

// Scopes required for the picker to download the file
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any;
let accessToken: string | null = null;
let pickerInited = false;
let gisInited = false;

/**
 * Configure the Drive Service with a Client ID dynamically.
 */
export const configureDrive = (clientId: string) => {
    configuredClientId = clientId;
    
    // Extract Project Number (App ID) from Client ID
    // Client ID format is usually: "123456789-abcdefg.apps.googleusercontent.com"
    // The part before the first hyphen is the Project Number.
    const match = clientId.match(/^(\d+)-/);
    if (match && match[1]) {
        configuredAppId = match[1];
        console.log("Auto-configured App ID:", configuredAppId);
    } else {
        configuredAppId = '';
    }

    // Reset token client if ID changes
    tokenClient = null; 
    accessToken = null;
};

/**
 * Checks if the Drive service has a Client ID configured.
 */
export const isDriveConfigured = (): boolean => {
    return !!configuredClientId && configuredClientId.trim().length > 0;
};

/**
 * Loads the necessary Google API scripts dynamically.
 */
export const loadGoogleDriveScripts = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== 'undefined' && (window as any).google?.picker) {
        resolve();
        return;
    }

    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
        (window as any).gapi.load('client:picker', async () => {
            await (window as any).gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
            pickerInited = true;
            maybeResolve();
        });
    };
    gapiScript.onerror = reject;
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
        gisInited = true;
        maybeResolve();
    };
    gisScript.onerror = reject;
    document.body.appendChild(gisScript);

    function maybeResolve() {
        if (pickerInited && gisInited) {
            resolve();
        }
    }
  });
};

/**
 * Initializes the Token Client.
 */
const initTokenClient = () => {
    if (tokenClient) return;
    if (!configuredClientId) throw new Error("Client ID not configured");
    
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: configuredClientId,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
            }
        },
    });
};

/**
 * Downloads a file from Drive using the API and converts it to a JS File object.
 */
const downloadDriveFile = async (fileId: string, fileName: string, mimeType: string): Promise<File> => {
    if (!accessToken) throw new Error("No access token available");

    // Fetch the file content using the Drive API
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const blob = await response.blob();
    return new File([blob], fileName, { type: mimeType });
};

/**
 * Opens the Google Drive Picker and returns selected files.
 */
export const openDrivePicker = async (): Promise<File[] | null> => {
    if (!configuredClientId) {
        console.warn("Google Drive Client ID is missing.");
        return null;
    }

    await loadGoogleDriveScripts();
    initTokenClient();

    return new Promise((resolve, reject) => {
        const showPicker = () => {
            const pickerCallback = async (data: any) => {
                if (data.action === (window as any).google.picker.Action.PICKED) {
                    try {
                        const docs = data.docs;
                        const files: File[] = [];
                        
                        // Download all selected files
                        for (const doc of docs) {
                            const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType);
                            files.push(file);
                        }
                        resolve(files);
                    } catch (e) {
                        reject(e);
                    }
                } else if (data.action === (window as any).google.picker.Action.CANCEL) {
                    resolve([]); // User cancelled
                }
            };

            // Enhanced View Configuration
            const docsView = new (window as any).google.picker.DocsView();
            docsView.setIncludeFolders(true);
            // Use LIST mode to make selection behavior more intuitive than GRID
            docsView.setMode((window as any).google.picker.DocsViewMode.LIST); 
            docsView.setMimeTypes("application/pdf,image/png,image/jpeg,image/jpg");
            // Explicitly allow these types to be selectable
            docsView.setSelectableMimeTypes("application/pdf,image/png,image/jpeg,image/jpg");

            const pickerBuilder = new (window as any).google.picker.PickerBuilder()
                .enableFeature((window as any).google.picker.Feature.NAV_HIDDEN)
                .enableFeature((window as any).google.picker.Feature.MULTISELECT_ENABLED)
                // Critical: Support Shared Drives
                .enableFeature((window as any).google.picker.Feature.SUPPORT_DRIVES)
                .setDeveloperKey(DEVELOPER_KEY)
                .setOAuthToken(accessToken)
                .addView(docsView)
                .setCallback(pickerCallback);

            // CRITICAL FIX: Set App ID (Project Number) if available
            // This is often required to prevent files from opening in a new tab instead of being selected.
            if (configuredAppId) {
                pickerBuilder.setAppId(configuredAppId);
            }

            // CRITICAL: Set the origin to prevent double-click from opening files in new tabs.
            // This MUST match the origin registered in Google Cloud Console.
            if (window.location.origin && window.location.protocol !== 'file:') {
                pickerBuilder.setOrigin(window.location.origin);
            }

            const picker = pickerBuilder.build();
            picker.setVisible(true);
        };

        // Trigger Auth if needed
        if (accessToken) {
            showPicker();
        } else {
            // Request token
            tokenClient.callback = (tokenResponse: any) => {
                if (tokenResponse.error !== undefined) {
                    reject(tokenResponse);
                    throw (tokenResponse);
                }
                accessToken = tokenResponse.access_token;
                showPicker();
            };
            tokenClient.requestAccessToken({prompt: 'consent'});
        }
    });
};