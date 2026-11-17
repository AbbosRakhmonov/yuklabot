// Instagram web app id (the same for everyone, sent by instagram.com itself)
export const IG_APP_ID = "936619743392459";
export const IG_ASBD_ID = "129477";

import { BROWSER_USER_AGENT } from "@/utils/cdnInput";

const CHROME_UA = BROWSER_USER_AGENT;

// Looks like the official Android app
export const MOBILE_HEADERS = {
  "user-agent":
    "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)",
  "x-ig-app-locale": "en_US",
  "x-ig-device-locale": "en_US",
  "x-ig-mapped-locale": "en_US",
  "accept-language": "en-US",
  "accept-encoding": "gzip, deflate, br",
  "x-fb-http-engine": "Liger",
  "x-fb-client-ip": "True",
  "x-fb-server-cluster": "True",
};

// Looks like desktop Chrome opening a page
export const BROWSER_HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "cache-control": "max-age=0",
  dnt: "1",
  priority: "u=0, i",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": CHROME_UA,
};


export const GQL_FRIENDLY_NAME = "PolarisPostActionLoadPostQueryQuery";
