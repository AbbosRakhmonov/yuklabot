/**
 * Universal interface for Instagram data from gallery-dl
 * This interface captures all possible fields returned by gallery-dl for Instagram posts/reels/stories
 */
export interface IInstagramGalleryDlData {
  // Basic identifiers
  id?: string;
  shortcode?: string;
  post_shortcode?: string;
  post_id?: string;
  media_id?: string;
  sidecar_media_id?: string;
  sidecar_shortcode?: string;

  // URLs
  url?: string;
  post_url?: string;
  display_url?: string;
  video_url?: string | null;
  thumbnail?: string;

  // Content information
  title?: string;
  caption?: string;
  description?: string;

  // User/Account information
  username?: string;
  owner_username?: string;
  owner_id?: string;
  fullname?: string;

  // Owner details (detailed account information)
  owner?: IInstagramOwner;

  // Post metadata
  category?: string;
  type?: string;
  subcategory?: string;
  count?: number;
  num?: number;

  // Dates
  date?: string;
  post_date?: string;
  timestamp?: number;

  // Engagement metrics
  liked?: boolean;
  likes?: number;
  pinned?: unknown[];

  // Media properties
  is_video?: boolean;
  extension?: string;
  filename?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  width?: number;
  height?: number;
  width_original?: number;
  height_original?: number;
  video_duration?: number;

  // Carousel/Sidecar data
  // From gallery-dl: array of IInstagramGalleryDlData objects (one per carousel item)
  carousel_media?: IInstagramGalleryDlData[];
  // Fallback for Instagram API format (if needed)
  edge_sidecar_to_children?: {
    edges?: IGalleryDlEdge[];
  };

  // Additional metadata
  tagged_users?: unknown[];
  tags?: string[];
}

/**
 * Detailed Instagram owner/account information
 */
export interface IInstagramOwner {
  // Basic identifiers
  id?: string;
  pk?: string;
  pk_id?: string;
  username?: string;
  full_name?: string;
  fbid_v2?: string;
  strong_id__?: string;

  // Account status
  account_type?: number;
  is_verified?: boolean;
  is_private?: boolean;
  is_unpublished?: boolean;
  is_active_on_text_post_app?: boolean;
  is_embeds_disabled?: boolean;
  is_favorite?: boolean;
  is_ring_creator?: boolean;
  text_post_app_is_private?: boolean;
  third_party_downloads_enabled?: number;
  transparency_product_enabled?: boolean;
  show_account_transparency_details?: boolean;
  show_ring_award?: boolean;
  has_anonymous_profile_picture?: boolean;

  // Profile picture
  profile_pic_id?: string;
  profile_pic_url?: string;
  hd_profile_pic_url_info?: {
    height?: number;
    width?: number;
    url?: string;
  };
  hd_profile_pic_versions?: Array<{
    height?: number;
    width?: number;
    url?: string;
  }>;

  // Friendship status
  friendship_status?: {
    followed_by?: boolean;
    following?: boolean;
    is_bestie?: boolean;
    is_feed_favorite?: boolean;
    is_muting_reel?: boolean;
    is_private?: boolean;
    is_restricted?: boolean;
  };

  // Fan club information
  fan_club_info?: {
    autosave_to_exclusive_highlight?: unknown;
    connected_member_count?: unknown;
    fan_club_id?: unknown;
    fan_club_name?: unknown;
    fan_consideration_page_revamp_eligiblity?: unknown;
    has_created_ssc?: unknown;
    has_enough_subscribers_for_ssc?: unknown;
    is_fan_club_gifting_eligible?: unknown;
    is_fan_club_referral_eligible?: unknown;
    is_free_trial_eligible?: unknown;
    largest_public_bc_id?: unknown;
    should_show_playlists_in_profile_tab?: unknown;
    subscriber_count?: unknown;
  };

  // Additional features
  feed_post_reshare_disabled?: boolean;
  can_see_quiet_post_attribution?: boolean;
  eligible_for_text_app_activation_badge?: boolean;
  latest_reel_media?: number;
  user_activation_info?: Record<string, unknown>;
  account_badges?: unknown[];
}

/**
 * Gallery-dl carousel item (for multi-media posts)
 */
export interface IGalleryDlCarouselItem {
  id?: string;
  shortcode?: string;
  media_id?: string;
  is_video?: boolean;
  video_url?: string | null;
  display_url?: string;
  url?: string;
  thumbnail?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  width?: number;
  height?: number;
  width_original?: number;
  height_original?: number;
  num?: number;
  extension?: string;
  filename?: string;
}

/**
 * Gallery-dl edge (wrapper for carousel items)
 */
export interface IGalleryDlEdge {
  node?: IGalleryDlCarouselItem;
}

/**
 * Gallery-dl JSON response structure
 * Array format: [[status_code, metadata], [status_code, url, media_data], ...]
 */
export type IGalleryDlJsonResponse = Array<
  | [number, IInstagramGalleryDlData] // Status 2: Post metadata
  | [number, string, IInstagramGalleryDlData] // Status 3: Media item with URL
>;

/**
 * Legacy interface for backward compatibility
 * @deprecated Use IInstagramGalleryDlData instead
 */
export type IGalleryDlJsonData = IInstagramGalleryDlData;
