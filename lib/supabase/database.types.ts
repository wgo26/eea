export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * A6 — GENERATED FILE. Do not edit by hand.
 * Regenerate with: node scripts/generate-database-types.mjs
 * Sources: migration DDL (authoritative columns/enums/rpcs) + PostgREST OpenAPI
 * description (jsonb typing + FK relationships).
 * CI fails when this file drifts from the schema: node scripts/generate-database-types.mjs --check
 */

export type Database = {
    public: {
        Enums: {
        ad_status: {
            Enum: (
                | "draft"
                | "pending"
                | "active"
                | "paused"
                | "ended"
                | "rejected"
            );
        }
        app_role: {
            Enum: (
                | "admin"
                | "editor"
                | "contributor"
                | "advertiser"
            );
        }
        brand_asset_type: {
            Enum: (
                | "logo"
                | "wordmark"
                | "icon"
                | "illustration"
            );
        }
        content_status: {
            Enum: (
                | "draft"
                | "pending"
                | "approved"
                | "scheduled"
                | "published"
                | "archived"
                | "rejected"
            );
        }
        content_type: {
            Enum: (
                | "photo_story"
                | "news"
                | "listing"
                | "notice"
                | "culture"
            );
        }
        credential_status: {
            Enum: (
                | "active"
                | "disabled"
                | "expired"
                | "revoked"
            );
        }
        incident_status: {
            Enum: (
                | "investigating"
                | "identified"
                | "mitigating"
                | "monitoring"
                | "resolved"
            );
        }
        layout_template: {
            Enum: (
                | "standard"
                | "feature"
                | "timeline"
                | "photo_essay"
                | "micro_story"
                | "breaking"
            );
        }
        listing_status: {
            Enum: (
                | "draft"
                | "active"
                | "sold"
                | "expired"
                | "removed"
                | "pending"
            );
        }
        media_kind: {
            Enum: (
                | "image"
                | "video"
                | "audio"
                | "document"
            );
        }
        notice_type: {
            Enum: (
                | "public_notice"
                | "lost_found"
                | "road_closure"
                | "community_alert"
                | "missing_person"
                | "service_announcement"
                | "government_notice"
                | "school_notice"
                | "organization_notice"
                | "other"
            );
        }
        report_status: {
            Enum: (
                | "open"
                | "investigating"
                | "resolved"
                | "dismissed"
            );
        }
        report_type: {
            Enum: (
                | "spam"
                | "abuse"
                | "copyright"
                | "misinformation"
                | "other"
            );
        }
        severity_level: {
            Enum: (
                | "normal"
                | "info"
                | "warning"
                | "critical"
            );
        }
        storage_destination: {
            Enum: (
                | "public_photo"
                | "admin_asset"
                | "backup"
            );
        }
        storage_provider: {
            Enum: (
                | "r2"
                | "supabase"
                | "b2"
                | "cloudinary"
            );
        }
        submission_status: {
            Enum: (
                | "pending"
                | "in_review"
                | "approved"
                | "rejected"
                | "needs_clarification"
                | "published"
                | "withdrawn"
            );
        }
        submission_type: {
            Enum: (
                | "photo_story"
                | "news"
                | "culture"
                | "notice"
                | "buy_sell"
            );
        }
        theme_status: {
            Enum: (
                | "draft"
                | "review"
                | "approved"
                | "published"
                | "archived"
            );
        }
        verification_status: {
            Enum: (
                | "verified"
                | "community_submission"
                | "official_source"
                | "developing"
            );
        }
        voice_type: {
            Enum: (
                | "formal"
                | "pidgin"
                | "camfranglais"
            );
        }
        };
        Tables: {
        about_sections: {
            Row: {
            id: string;
            section_key: string;
            locale: string;
            heading: string | null;
            body: string | null;
            cta_label: string | null;
            cta_href: string | null;
            is_active: boolean;
            updated_at: string;
            };
            Insert: {
            id?: string;
            section_key: string;
            locale?: string;
            heading?: string | null;
            body?: string | null;
            cta_label?: string | null;
            cta_href?: string | null;
            is_active?: boolean;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            section_key?: string | null;
            locale?: string | null;
            heading?: string | null;
            body?: string | null;
            cta_label?: string | null;
            cta_href?: string | null;
            is_active?: boolean | null;
            updated_at?: string | null;
            };
            Relationships: [];
        }
        ad_campaigns: {
            Row: {
            id: string;
            advertiser_id: string | null;
            ad_slot_id: string | null;
            name: string;
            status: string;
            creative_media_id: string | null;
            destination_url: string | null;
            copy_text: string | null;
            starts_at: string | null;
            ends_at: string | null;
            agreed_price: number | null;
            currency: string | null;
            invoice_reference: string | null;
            payment_status: string | null;
            created_at: string;
            updated_at: string;
            impressions_count: number;
            clicks_count: number;
            rejection_reason: string | null;
            approved_at: string | null;
            approved_by: string | null;
            budget_limit: number | null;
            impression_limit: number | null;
            click_limit: number | null;
            creative_status: string;
            creative_rejection_reason: string | null;
            expired_at: string | null;
            creative_type: string;
            mobile_creative_media_id: string | null;
            poster_media_id: string | null;
            creative_html: string | null;
            creative_width: number | null;
            creative_height: number | null;
            };
            Insert: {
            id?: string;
            advertiser_id?: string | null;
            ad_slot_id?: string | null;
            name: string;
            status?: string;
            creative_media_id?: string | null;
            destination_url?: string | null;
            copy_text?: string | null;
            starts_at?: string | null;
            ends_at?: string | null;
            agreed_price?: number | null;
            currency?: string | null;
            invoice_reference?: string | null;
            payment_status?: string | null;
            created_at?: string;
            updated_at?: string;
            impressions_count?: number;
            clicks_count?: number;
            rejection_reason?: string | null;
            approved_at?: string | null;
            approved_by?: string | null;
            budget_limit?: number | null;
            impression_limit?: number | null;
            click_limit?: number | null;
            creative_status?: string;
            creative_rejection_reason?: string | null;
            expired_at?: string | null;
            creative_type?: string;
            mobile_creative_media_id?: string | null;
            poster_media_id?: string | null;
            creative_html?: string | null;
            creative_width?: number | null;
            creative_height?: number | null;
            };
            Update: {
            id?: string | null;
            advertiser_id?: string | null;
            ad_slot_id?: string | null;
            name?: string | null;
            status?: string | null;
            creative_media_id?: string | null;
            destination_url?: string | null;
            copy_text?: string | null;
            starts_at?: string | null;
            ends_at?: string | null;
            agreed_price?: number | null;
            currency?: string | null;
            invoice_reference?: string | null;
            payment_status?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            impressions_count?: number | null;
            clicks_count?: number | null;
            rejection_reason?: string | null;
            approved_at?: string | null;
            approved_by?: string | null;
            budget_limit?: number | null;
            impression_limit?: number | null;
            click_limit?: number | null;
            creative_status?: string | null;
            creative_rejection_reason?: string | null;
            expired_at?: string | null;
            creative_type?: string | null;
            mobile_creative_media_id?: string | null;
            poster_media_id?: string | null;
            creative_html?: string | null;
            creative_width?: number | null;
            creative_height?: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_ad_campaigns_advertiser_id_fkey",
                    columns: ["advertiser_id"],
                    isOneToOne: false,
                    referencedRelation: "advertisers",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_campaigns_ad_slot_id_fkey",
                    columns: ["ad_slot_id"],
                    isOneToOne: false,
                    referencedRelation: "ad_slots",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_campaigns_creative_media_id_fkey",
                    columns: ["creative_media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_campaigns_approved_by_fkey",
                    columns: ["approved_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_campaigns_mobile_creative_media_id_fkey",
                    columns: ["mobile_creative_media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_campaigns_poster_media_id_fkey",
                    columns: ["poster_media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        ad_events: {
            Row: {
            id: number;
            campaign_id: string;
            event_type: string;
            occurred_at: string;
            session_hash: string | null;
            metadata: Json | null;
            };
            Insert: {
            id?: number;
            campaign_id: string;
            event_type: string;
            occurred_at?: string;
            session_hash?: string | null;
            metadata?: Json | null;
            };
            Update: {
            id?: number | null;
            campaign_id?: string | null;
            event_type?: string | null;
            occurred_at?: string | null;
            session_hash?: string | null;
            metadata?: Json | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_ad_events_campaign_id_fkey",
                    columns: ["campaign_id"],
                    isOneToOne: false,
                    referencedRelation: "ad_campaigns",
                    referencedColumns: ["id"],
                },
            ];
        }
        ad_inquiry_events: {
            Row: {
            id: string;
            campaign_id: string;
            actor_id: string | null;
            event_type: string;
            reason: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            campaign_id: string;
            actor_id?: string | null;
            event_type: string;
            reason?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            campaign_id?: string | null;
            actor_id?: string | null;
            event_type?: string | null;
            reason?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_ad_inquiry_events_campaign_id_fkey",
                    columns: ["campaign_id"],
                    isOneToOne: false,
                    referencedRelation: "ad_campaigns",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_ad_inquiry_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        ad_slots: {
            Row: {
            id: string;
            slot_key: string;
            name: string;
            placement: string | null;
            dimensions: string | null;
            description: string | null;
            base_price: number | null;
            currency: string | null;
            is_active: boolean;
            capacity: number;
            updated_at: string;
            allowed_formats: string[];
            max_duration_seconds: number | null;
            mobile_dimensions: string | null;
            };
            Insert: {
            id?: string;
            slot_key: string;
            name: string;
            placement?: string | null;
            dimensions?: string | null;
            description?: string | null;
            base_price?: number | null;
            currency?: string | null;
            is_active?: boolean;
            capacity?: number;
            updated_at?: string;
            allowed_formats?: string[];
            max_duration_seconds?: number | null;
            mobile_dimensions?: string | null;
            };
            Update: {
            id?: string | null;
            slot_key?: string | null;
            name?: string | null;
            placement?: string | null;
            dimensions?: string | null;
            description?: string | null;
            base_price?: number | null;
            currency?: string | null;
            is_active?: boolean | null;
            capacity?: number | null;
            updated_at?: string | null;
            allowed_formats?: string[] | null;
            max_duration_seconds?: number | null;
            mobile_dimensions?: string | null;
            };
            Relationships: [];
        }
        admin_notification_sources: {
            Row: {
            key: string;
            label: string;
            description: string | null;
            created_at: string;
            };
            Insert: {
            key: string;
            label: string;
            description?: string | null;
            created_at?: string;
            };
            Update: {
            key?: string | null;
            label?: string | null;
            description?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        admin_notifications: {
            Row: {
            id: string;
            user_id: string;
            source: string;
            category: string;
            title: string;
            body: string | null;
            link_path: string | null;
            is_read: boolean;
            created_at: string;
            expires_at: string | null;
            };
            Insert: {
            id?: string;
            user_id: string;
            source: string;
            category: string;
            title: string;
            body?: string | null;
            link_path?: string | null;
            is_read?: boolean;
            created_at?: string;
            expires_at?: string | null;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            source?: string | null;
            category?: string | null;
            title?: string | null;
            body?: string | null;
            link_path?: string | null;
            is_read?: boolean | null;
            created_at?: string | null;
            expires_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_admin_notifications_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_admin_notifications_source_fkey",
                    columns: ["source"],
                    isOneToOne: false,
                    referencedRelation: "admin_notification_sources",
                    referencedColumns: ["key"],
                },
            ];
        }
        admin_widget_layouts: {
            Row: {
            id: string;
            user_id: string;
            role: string;
            widgets: Json;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            user_id: string;
            role: string;
            widgets?: Json;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            role?: string | null;
            widgets?: Json | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_admin_widget_layouts_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        advertise_sections: {
            Row: {
            id: string;
            section_key: string;
            locale: string;
            heading: string | null;
            body: string | null;
            is_active: boolean;
            updated_at: string;
            };
            Insert: {
            id?: string;
            section_key: string;
            locale?: string;
            heading?: string | null;
            body?: string | null;
            is_active?: boolean;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            section_key?: string | null;
            locale?: string | null;
            heading?: string | null;
            body?: string | null;
            is_active?: boolean | null;
            updated_at?: string | null;
            };
            Relationships: [];
        }
        advertisers: {
            Row: {
            id: string;
            user_id: string | null;
            business_id: string | null;
            contact_name: string | null;
            company_name: string | null;
            email: string | null;
            phone: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            user_id?: string | null;
            business_id?: string | null;
            contact_name?: string | null;
            company_name?: string | null;
            email?: string | null;
            phone?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            business_id?: string | null;
            contact_name?: string | null;
            company_name?: string | null;
            email?: string | null;
            phone?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_advertisers_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_advertisers_business_id_fkey",
                    columns: ["business_id"],
                    isOneToOne: false,
                    referencedRelation: "businesses",
                    referencedColumns: ["id"],
                },
            ];
        }
        analytics_daily: {
            Row: {
            day: string;
            surface: string;
            locale: string;
            place: string;
            count: number;
            updated_at: string;
            };
            Insert: {
            day?: string;
            surface: string;
            locale?: string;
            place?: string;
            count?: number;
            updated_at?: string;
            };
            Update: {
            day?: string | null;
            surface?: string | null;
            locale?: string | null;
            place?: string | null;
            count?: number | null;
            updated_at?: string | null;
            };
            Relationships: [];
        }
        api_credentials: {
            Row: {
            id: string;
            name: string;
            provider: string;
            status: string;
            secret_encrypted: string;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            last_used_at: string | null;
            expires_at: string | null;
            rotation_policy: Json;
            metadata: Json;
            };
            Insert: {
            id?: string;
            name: string;
            provider: string;
            status?: string;
            secret_encrypted: string;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            last_used_at?: string | null;
            expires_at?: string | null;
            rotation_policy?: Json;
            metadata?: Json;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            provider?: string | null;
            status?: string | null;
            secret_encrypted?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            last_used_at?: string | null;
            expires_at?: string | null;
            rotation_policy?: Json | null;
            metadata?: Json | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_api_credentials_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        audit_events: {
            Row: {
            id: string;
            actor_id: string | null;
            actor_role: string | null;
            action: string;
            resource_type: string;
            resource_id: string | null;
            created_at: string;
            request_id: string | null;
            source: string;
            metadata: Json;
            };
            Insert: {
            id?: string;
            actor_id?: string | null;
            actor_role?: string | null;
            action: string;
            resource_type: string;
            resource_id?: string | null;
            created_at?: string;
            request_id?: string | null;
            source?: string;
            metadata?: Json;
            };
            Update: {
            id?: string | null;
            actor_id?: string | null;
            actor_role?: string | null;
            action?: string | null;
            resource_type?: string | null;
            resource_id?: string | null;
            created_at?: string | null;
            request_id?: string | null;
            source?: string | null;
            metadata?: Json | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_audit_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        backup_jobs: {
            Row: {
            job_name: string;
            locked_by: string | null;
            locked_at: string | null;
            lease_expires_at: string | null;
            last_run_at: string | null;
            last_run_result: Json | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            job_name: string;
            locked_by?: string | null;
            locked_at?: string | null;
            lease_expires_at?: string | null;
            last_run_at?: string | null;
            last_run_result?: Json | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            job_name?: string | null;
            locked_by?: string | null;
            locked_at?: string | null;
            lease_expires_at?: string | null;
            last_run_at?: string | null;
            last_run_result?: Json | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [];
        }
        brand_asset_usage: {
            Row: {
            id: string;
            asset_id: string;
            theme_id: string;
            role: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            asset_id: string;
            theme_id: string;
            role?: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            asset_id?: string | null;
            theme_id?: string | null;
            role?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_brand_asset_usage_asset_id_fkey",
                    columns: ["asset_id"],
                    isOneToOne: false,
                    referencedRelation: "brand_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_brand_asset_usage_theme_id_fkey",
                    columns: ["theme_id"],
                    isOneToOne: false,
                    referencedRelation: "brand_themes",
                    referencedColumns: ["id"],
                },
            ];
        }
        brand_assets: {
            Row: {
            id: string;
            name: string;
            type: string;
            file_url: string;
            provider: string;
            storage_key: string | null;
            dimensions: Json;
            format: string | null;
            size_bytes: number | null;
            version: number;
            owner_id: string | null;
            usage_restrictions: string | null;
            is_active: boolean;
            replaced_by_id: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            name: string;
            type?: string;
            file_url: string;
            provider?: string;
            storage_key?: string | null;
            dimensions?: Json;
            format?: string | null;
            size_bytes?: number | null;
            version?: number;
            owner_id?: string | null;
            usage_restrictions?: string | null;
            is_active?: boolean;
            replaced_by_id?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            type?: string | null;
            file_url?: string | null;
            provider?: string | null;
            storage_key?: string | null;
            dimensions?: Json | null;
            format?: string | null;
            size_bytes?: number | null;
            version?: number | null;
            owner_id?: string | null;
            usage_restrictions?: string | null;
            is_active?: boolean | null;
            replaced_by_id?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_brand_assets_owner_id_fkey",
                    columns: ["owner_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_brand_assets_replaced_by_id_fkey",
                    columns: ["replaced_by_id"],
                    isOneToOne: false,
                    referencedRelation: "brand_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        brand_theme_versions: {
            Row: {
            id: string;
            theme_id: string;
            version: string;
            tokens: Json;
            change_summary: string | null;
            created_by: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            theme_id: string;
            version: string;
            tokens?: Json;
            change_summary?: string | null;
            created_by?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            theme_id?: string | null;
            version?: string | null;
            tokens?: Json | null;
            change_summary?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_brand_theme_versions_theme_id_fkey",
                    columns: ["theme_id"],
                    isOneToOne: false,
                    referencedRelation: "brand_themes",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_brand_theme_versions_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        brand_themes: {
            Row: {
            id: string;
            name: string;
            version: string;
            tokens: Json;
            status: string;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            approved_by: string | null;
            approved_at: string | null;
            preview_token: string | null;
            is_active: boolean;
            };
            Insert: {
            id?: string;
            name: string;
            version?: string;
            tokens?: Json;
            status?: string;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            approved_by?: string | null;
            approved_at?: string | null;
            preview_token?: string | null;
            is_active?: boolean;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            version?: string | null;
            tokens?: Json | null;
            status?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            approved_by?: string | null;
            approved_at?: string | null;
            preview_token?: string | null;
            is_active?: boolean | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_brand_themes_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_brand_themes_approved_by_fkey",
                    columns: ["approved_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        business_categories: {
            Row: {
            business_id: string;
            category_id: string;
            };
            Insert: {
            business_id: string;
            category_id: string;
            };
            Update: {
            business_id?: string | null;
            category_id?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_business_categories_business_id_fkey",
                    columns: ["business_id"],
                    isOneToOne: false,
                    referencedRelation: "businesses",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_business_categories_category_id_fkey",
                    columns: ["category_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
            ];
        }
        business_media: {
            Row: {
            business_id: string;
            media_id: string;
            sort_order: number;
            };
            Insert: {
            business_id: string;
            media_id: string;
            sort_order?: number;
            };
            Update: {
            business_id?: string | null;
            media_id?: string | null;
            sort_order?: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_business_media_business_id_fkey",
                    columns: ["business_id"],
                    isOneToOne: false,
                    referencedRelation: "businesses",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_business_media_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        businesses: {
            Row: {
            id: string;
            owner_id: string | null;
            location_id: string | null;
            name: string;
            slug: string;
            description: string | null;
            phone: string | null;
            email: string | null;
            whatsapp: string | null;
            website_url: string | null;
            instagram_url: string | null;
            facebook_url: string | null;
            opening_hours: Json | null;
            is_verified: boolean;
            is_featured: boolean;
            status: string;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            owner_id?: string | null;
            location_id?: string | null;
            name: string;
            slug: string;
            description?: string | null;
            phone?: string | null;
            email?: string | null;
            whatsapp?: string | null;
            website_url?: string | null;
            instagram_url?: string | null;
            facebook_url?: string | null;
            opening_hours?: Json | null;
            is_verified?: boolean;
            is_featured?: boolean;
            status?: string;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            owner_id?: string | null;
            location_id?: string | null;
            name?: string | null;
            slug?: string | null;
            description?: string | null;
            phone?: string | null;
            email?: string | null;
            whatsapp?: string | null;
            website_url?: string | null;
            instagram_url?: string | null;
            facebook_url?: string | null;
            opening_hours?: Json | null;
            is_verified?: boolean | null;
            is_featured?: boolean | null;
            status?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_businesses_owner_id_fkey",
                    columns: ["owner_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_businesses_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
            ];
        }
        categories: {
            Row: {
            id: string;
            slug: string;
            content_type: string;
            parent_id: string | null;
            sort_order: number;
            is_active: boolean;
            created_at: string;
            };
            Insert: {
            id?: string;
            slug: string;
            content_type: string;
            parent_id?: string | null;
            sort_order?: number;
            is_active?: boolean;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            slug?: string | null;
            content_type?: string | null;
            parent_id?: string | null;
            sort_order?: number | null;
            is_active?: boolean | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_categories_parent_id_fkey",
                    columns: ["parent_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
            ];
        }
        category_translations: {
            Row: {
            category_id: string;
            locale: string;
            name: string;
            description: string | null;
            };
            Insert: {
            category_id: string;
            locale: string;
            name: string;
            description?: string | null;
            };
            Update: {
            category_id?: string | null;
            locale?: string | null;
            name?: string | null;
            description?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_category_translations_category_id_fkey",
                    columns: ["category_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_feedback: {
            Row: {
            user_id: string;
            content_item_id: string;
            helpful: boolean;
            created_at: string;
            };
            Insert: {
            user_id: string;
            content_item_id: string;
            helpful: boolean;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            content_item_id?: string | null;
            helpful?: boolean | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_feedback_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_feedback_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_follows: {
            Row: {
            user_id: string;
            content_type: string;
            category_id: string;
            location_id: string;
            created_at: string;
            };
            Insert: {
            user_id: string;
            content_type: string;
            category_id: string;
            location_id: string;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            content_type?: string | null;
            category_id?: string | null;
            location_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_follows_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_follows_category_id_fkey",
                    columns: ["category_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_follows_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_items: {
            Row: {
            id: string;
            type: string;
            slug: string;
            status: string;
            verification: string | null;
            location_id: string | null;
            category_id: string | null;
            submitted_by: string | null;
            author_id: string | null;
            layout_template: string;
            is_featured: boolean;
            is_archived: boolean;
            view_count: number;
            share_count: number;
            published_at: string | null;
            scheduled_for: string | null;
            expires_at: string | null;
            created_at: string;
            updated_at: string;
            import_source: string | null;
            import_source_id: string | null;
            legacy_path: string | null;
            template_id: string | null;
            template_ledger: Json;
            };
            Insert: {
            id?: string;
            type: string;
            slug: string;
            status?: string;
            verification?: string | null;
            location_id?: string | null;
            category_id?: string | null;
            submitted_by?: string | null;
            author_id?: string | null;
            layout_template?: string;
            is_featured?: boolean;
            is_archived?: boolean;
            view_count?: number;
            share_count?: number;
            published_at?: string | null;
            scheduled_for?: string | null;
            expires_at?: string | null;
            created_at?: string;
            updated_at?: string;
            import_source?: string | null;
            import_source_id?: string | null;
            legacy_path?: string | null;
            template_id?: string | null;
            template_ledger?: Json;
            };
            Update: {
            id?: string | null;
            type?: string | null;
            slug?: string | null;
            status?: string | null;
            verification?: string | null;
            location_id?: string | null;
            category_id?: string | null;
            submitted_by?: string | null;
            author_id?: string | null;
            layout_template?: string | null;
            is_featured?: boolean | null;
            is_archived?: boolean | null;
            view_count?: number | null;
            share_count?: number | null;
            published_at?: string | null;
            scheduled_for?: string | null;
            expires_at?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            import_source?: string | null;
            import_source_id?: string | null;
            legacy_path?: string | null;
            template_id?: string | null;
            template_ledger?: Json | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_items_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_items_category_id_fkey",
                    columns: ["category_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_items_submitted_by_fkey",
                    columns: ["submitted_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_items_author_id_fkey",
                    columns: ["author_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_reactions: {
            Row: {
            id: string;
            content_item_id: string;
            kind: string;
            reactor_token: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            kind: string;
            reactor_token: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            kind?: string | null;
            reactor_token?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_reactions_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_relationships: {
            Row: {
            id: string;
            source_content_id: string;
            target_content_id: string;
            relationship_type: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            source_content_id: string;
            target_content_id: string;
            relationship_type: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            source_content_id?: string | null;
            target_content_id?: string | null;
            relationship_type?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_relationships_source_content_id_fkey",
                    columns: ["source_content_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_relationships_target_content_id_fkey",
                    columns: ["target_content_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_tags: {
            Row: {
            content_item_id: string;
            tag_id: string;
            };
            Insert: {
            content_item_id: string;
            tag_id: string;
            };
            Update: {
            content_item_id?: string | null;
            tag_id?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_tags_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_content_tags_tag_id_fkey",
                    columns: ["tag_id"],
                    isOneToOne: false,
                    referencedRelation: "tags",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_templates: {
            Row: {
            id: string;
            name: string;
            name_fr: string | null;
            slug_base: string;
            section: string;
            source_type: string | null;
            source_filters: Json;
            window_days: number;
            cadence: string;
            living: boolean;
            is_active: boolean;
            last_compiled_at: string | null;
            last_added_count: number | null;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            name: string;
            name_fr?: string | null;
            slug_base: string;
            section: string;
            source_type?: string | null;
            source_filters?: Json;
            window_days?: number;
            cadence?: string;
            living?: boolean;
            is_active?: boolean;
            last_compiled_at?: string | null;
            last_added_count?: number | null;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            name_fr?: string | null;
            slug_base?: string | null;
            section?: string | null;
            source_type?: string | null;
            source_filters?: Json | null;
            window_days?: number | null;
            cadence?: string | null;
            living?: boolean | null;
            is_active?: boolean | null;
            last_compiled_at?: string | null;
            last_added_count?: number | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_templates_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        content_translations: {
            Row: {
            id: string;
            content_item_id: string;
            locale: string;
            voice: string;
            title: string | null;
            excerpt: string | null;
            body: string | null;
            social_share_text: string | null;
            whatsapp_share_text: string | null;
            seo_title: string | null;
            seo_description: string | null;
            created_at: string;
            updated_at: string;
            byline: string | null;
            search_vector: string | null;
            share_text: string | null;
            voice_type: string | null;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            locale: string;
            voice?: string;
            title?: string | null;
            excerpt?: string | null;
            body?: string | null;
            social_share_text?: string | null;
            whatsapp_share_text?: string | null;
            seo_title?: string | null;
            seo_description?: string | null;
            created_at?: string;
            updated_at?: string;
            byline?: string | null;
            search_vector?: string | null;
            share_text?: string | null;
            voice_type?: string | null;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            locale?: string | null;
            voice?: string | null;
            title?: string | null;
            excerpt?: string | null;
            body?: string | null;
            social_share_text?: string | null;
            whatsapp_share_text?: string | null;
            seo_title?: string | null;
            seo_description?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            byline?: string | null;
            search_vector?: string | null;
            share_text?: string | null;
            voice_type?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_content_translations_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        contributor_follows: {
            Row: {
            follower_id: string;
            contributor_id: string;
            created_at: string;
            };
            Insert: {
            follower_id: string;
            contributor_id: string;
            created_at?: string;
            };
            Update: {
            follower_id?: string | null;
            contributor_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_contributor_follows_follower_id_fkey",
                    columns: ["follower_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_contributor_follows_contributor_id_fkey",
                    columns: ["contributor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        corrections: {
            Row: {
            id: string;
            content_item_id: string;
            reporter_id: string | null;
            correction_text: string;
            status: string;
            reviewed_by: string | null;
            resolution: string | null;
            created_at: string;
            resolved_at: string | null;
            reporter_name: string | null;
            reporter_email: string | null;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            reporter_id?: string | null;
            correction_text: string;
            status?: string;
            reviewed_by?: string | null;
            resolution?: string | null;
            created_at?: string;
            resolved_at?: string | null;
            reporter_name?: string | null;
            reporter_email?: string | null;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            reporter_id?: string | null;
            correction_text?: string | null;
            status?: string | null;
            reviewed_by?: string | null;
            resolution?: string | null;
            created_at?: string | null;
            resolved_at?: string | null;
            reporter_name?: string | null;
            reporter_email?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_corrections_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_corrections_reporter_id_fkey",
                    columns: ["reporter_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_corrections_reviewed_by_fkey",
                    columns: ["reviewed_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        credential_events: {
            Row: {
            id: string;
            credential_id: string;
            action: string;
            actor_id: string | null;
            created_at: string;
            request_id: string | null;
            source: string;
            };
            Insert: {
            id?: string;
            credential_id: string;
            action: string;
            actor_id?: string | null;
            created_at?: string;
            request_id?: string | null;
            source?: string;
            };
            Update: {
            id?: string | null;
            credential_id?: string | null;
            action?: string | null;
            actor_id?: string | null;
            created_at?: string | null;
            request_id?: string | null;
            source?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_credential_events_credential_id_fkey",
                    columns: ["credential_id"],
                    isOneToOne: false,
                    referencedRelation: "api_credentials",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_credential_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        daily_brief_items: {
            Row: {
            brief_id: string;
            content_item_id: string;
            sort_order: number;
            };
            Insert: {
            brief_id: string;
            content_item_id: string;
            sort_order?: number;
            };
            Update: {
            brief_id?: string | null;
            content_item_id?: string | null;
            sort_order?: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_daily_brief_items_brief_id_fkey",
                    columns: ["brief_id"],
                    isOneToOne: false,
                    referencedRelation: "daily_briefs",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_daily_brief_items_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        daily_briefs: {
            Row: {
            id: string;
            publish_date: string;
            locale: string;
            voice: string;
            subject: string | null;
            intro: string | null;
            body: string | null;
            status: string;
            published_at: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            publish_date: string;
            locale?: string;
            voice?: string;
            subject?: string | null;
            intro?: string | null;
            body?: string | null;
            status?: string;
            published_at?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            publish_date?: string | null;
            locale?: string | null;
            voice?: string | null;
            subject?: string | null;
            intro?: string | null;
            body?: string | null;
            status?: string | null;
            published_at?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        data_requests: {
            Row: {
            id: string;
            requester_id: string | null;
            requester_email: string | null;
            request_type: string;
            description: string | null;
            status: string;
            assigned_to: string | null;
            created_at: string;
            resolved_at: string | null;
            resolution: string | null;
            };
            Insert: {
            id?: string;
            requester_id?: string | null;
            requester_email?: string | null;
            request_type: string;
            description?: string | null;
            status?: string;
            assigned_to?: string | null;
            created_at?: string;
            resolved_at?: string | null;
            resolution?: string | null;
            };
            Update: {
            id?: string | null;
            requester_id?: string | null;
            requester_email?: string | null;
            request_type?: string | null;
            description?: string | null;
            status?: string | null;
            assigned_to?: string | null;
            created_at?: string | null;
            resolved_at?: string | null;
            resolution?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_data_requests_requester_id_fkey",
                    columns: ["requester_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_data_requests_assigned_to_fkey",
                    columns: ["assigned_to"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        db_dumps: {
            Row: {
            id: string;
            filename: string;
            sha256: string;
            size_bytes: number;
            created_at: string;
            correlation_id: string | null;
            expires_at: string;
            };
            Insert: {
            id?: string;
            filename: string;
            sha256: string;
            size_bytes: number;
            created_at?: string;
            correlation_id?: string | null;
            expires_at?: string;
            };
            Update: {
            id?: string | null;
            filename?: string | null;
            sha256?: string | null;
            size_bytes?: number | null;
            created_at?: string | null;
            correlation_id?: string | null;
            expires_at?: string | null;
            };
            Relationships: [];
        }
        digest_issues: {
            Row: {
            id: string;
            sent_on: string;
            locale: string;
            subject: string;
            stories: Json;
            emailed: number;
            whatsapped: number;
            created_at: string;
            cadence: string;
            };
            Insert: {
            id?: string;
            sent_on: string;
            locale?: string;
            subject: string;
            stories?: Json;
            emailed?: number;
            whatsapped?: number;
            created_at?: string;
            cadence?: string;
            };
            Update: {
            id?: string | null;
            sent_on?: string | null;
            locale?: string | null;
            subject?: string | null;
            stories?: Json | null;
            emailed?: number | null;
            whatsapped?: number | null;
            created_at?: string | null;
            cadence?: string | null;
            };
            Relationships: [];
        }
        digest_slots: {
            Row: {
            id: string;
            issue_date: string;
            locale: string;
            content_item_id: string;
            item_type: string;
            section: string;
            path: string;
            title: string;
            share_text: string | null;
            rank_hint: number;
            pinned: boolean;
            removed: boolean;
            sent_at: string | null;
            created_at: string;
            location_id: string | null;
            category_id: string | null;
            };
            Insert: {
            id?: string;
            issue_date: string;
            locale: string;
            content_item_id: string;
            item_type: string;
            section: string;
            path: string;
            title: string;
            share_text?: string | null;
            rank_hint?: number;
            pinned?: boolean;
            removed?: boolean;
            sent_at?: string | null;
            created_at?: string;
            location_id?: string | null;
            category_id?: string | null;
            };
            Update: {
            id?: string | null;
            issue_date?: string | null;
            locale?: string | null;
            content_item_id?: string | null;
            item_type?: string | null;
            section?: string | null;
            path?: string | null;
            title?: string | null;
            share_text?: string | null;
            rank_hint?: number | null;
            pinned?: boolean | null;
            removed?: boolean | null;
            sent_at?: string | null;
            created_at?: string | null;
            location_id?: string | null;
            category_id?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_digest_slots_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_digest_slots_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_digest_slots_category_id_fkey",
                    columns: ["category_id"],
                    isOneToOne: false,
                    referencedRelation: "categories",
                    referencedColumns: ["id"],
                },
            ];
        }
        digest_subscribers: {
            Row: {
            id: string;
            email: string | null;
            phone: string | null;
            whatsapp: string | null;
            locale: string;
            voice: string;
            diaspora_mode: boolean;
            is_active: boolean;
            created_at: string;
            pitch_variant: string;
            };
            Insert: {
            id?: string;
            email?: string | null;
            phone?: string | null;
            whatsapp?: string | null;
            locale?: string;
            voice?: string;
            diaspora_mode?: boolean;
            is_active?: boolean;
            created_at?: string;
            pitch_variant?: string;
            };
            Update: {
            id?: string | null;
            email?: string | null;
            phone?: string | null;
            whatsapp?: string | null;
            locale?: string | null;
            voice?: string | null;
            diaspora_mode?: boolean | null;
            is_active?: boolean | null;
            created_at?: string | null;
            pitch_variant?: string | null;
            };
            Relationships: [];
        }
        emergency_publish_events: {
            Row: {
            id: string;
            preset_id: string | null;
            content_item_id: string;
            actor_id: string;
            approval_id: string | null;
            severity: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            preset_id?: string | null;
            content_item_id: string;
            actor_id: string;
            approval_id?: string | null;
            severity: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            preset_id?: string | null;
            content_item_id?: string | null;
            actor_id?: string | null;
            approval_id?: string | null;
            severity?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_emergency_publish_events_preset_id_fkey",
                    columns: ["preset_id"],
                    isOneToOne: false,
                    referencedRelation: "emergency_publishing_presets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_emergency_publish_events_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_emergency_publish_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_emergency_publish_events_approval_id_fkey",
                    columns: ["approval_id"],
                    isOneToOne: false,
                    referencedRelation: "two_person_approvals",
                    referencedColumns: ["id"],
                },
            ];
        }
        emergency_publishing_presets: {
            Row: {
            id: string;
            name: string;
            content_type: string;
            template: Json;
            requires_two_person: boolean;
            created_by: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            name: string;
            content_type?: string;
            template?: Json;
            requires_two_person?: boolean;
            created_by?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            content_type?: string | null;
            template?: Json | null;
            requires_two_person?: boolean | null;
            created_by?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_emergency_publishing_presets_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        event_reminders: {
            Row: {
            id: string;
            user_id: string;
            content_item_id: string;
            remind_at: string;
            sent_at: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            user_id: string;
            content_item_id: string;
            remind_at: string;
            sent_at?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            content_item_id?: string | null;
            remind_at?: string | null;
            sent_at?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_event_reminders_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_event_reminders_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        events: {
            Row: {
            content_item_id: string;
            starts_at: string | null;
            ends_at: string | null;
            venue_name: string | null;
            ticket_url: string | null;
            organizer_name: string | null;
            organizer_phone: string | null;
            organizer_email: string | null;
            };
            Insert: {
            content_item_id: string;
            starts_at?: string | null;
            ends_at?: string | null;
            venue_name?: string | null;
            ticket_url?: string | null;
            organizer_name?: string | null;
            organizer_phone?: string | null;
            organizer_email?: string | null;
            };
            Update: {
            content_item_id?: string | null;
            starts_at?: string | null;
            ends_at?: string | null;
            venue_name?: string | null;
            ticket_url?: string | null;
            organizer_name?: string | null;
            organizer_phone?: string | null;
            organizer_email?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_events_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        fundraisers: {
            Row: {
            content_item_id: string;
            goal_amount: number | null;
            currency: string | null;
            raised_amount: number;
            organizer_name: string | null;
            organizer_phone: string | null;
            organizer_email: string | null;
            donation_url: string | null;
            verification_notes: string | null;
            closed_at: string | null;
            payout_method: string | null;
            payout_account: string | null;
            payout_account_name: string | null;
            };
            Insert: {
            content_item_id: string;
            goal_amount?: number | null;
            currency?: string | null;
            raised_amount?: number;
            organizer_name?: string | null;
            organizer_phone?: string | null;
            organizer_email?: string | null;
            donation_url?: string | null;
            verification_notes?: string | null;
            closed_at?: string | null;
            payout_method?: string | null;
            payout_account?: string | null;
            payout_account_name?: string | null;
            };
            Update: {
            content_item_id?: string | null;
            goal_amount?: number | null;
            currency?: string | null;
            raised_amount?: number | null;
            organizer_name?: string | null;
            organizer_phone?: string | null;
            organizer_email?: string | null;
            donation_url?: string | null;
            verification_notes?: string | null;
            closed_at?: string | null;
            payout_method?: string | null;
            payout_account?: string | null;
            payout_account_name?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_fundraisers_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        homepage_slots: {
            Row: {
            id: string;
            slot_key: string;
            content_item_id: string | null;
            sort_order: number;
            starts_at: string | null;
            ends_at: string | null;
            is_active: boolean;
            created_by: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            slot_key: string;
            content_item_id?: string | null;
            sort_order?: number;
            starts_at?: string | null;
            ends_at?: string | null;
            is_active?: boolean;
            created_by?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            slot_key?: string | null;
            content_item_id?: string | null;
            sort_order?: number | null;
            starts_at?: string | null;
            ends_at?: string | null;
            is_active?: boolean | null;
            created_by?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_homepage_slots_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_homepage_slots_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        incident_events: {
            Row: {
            id: string;
            incident_id: string;
            from_status: string | null;
            to_status: string | null;
            note: string | null;
            actor_id: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            incident_id: string;
            from_status?: string | null;
            to_status?: string | null;
            note?: string | null;
            actor_id?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            incident_id?: string | null;
            from_status?: string | null;
            to_status?: string | null;
            note?: string | null;
            actor_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_incident_events_incident_id_fkey",
                    columns: ["incident_id"],
                    isOneToOne: false,
                    referencedRelation: "incidents",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_incident_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        incidents: {
            Row: {
            id: string;
            title: string;
            severity: string;
            description: string | null;
            affected_services: string[];
            start_time: string;
            current_status: string;
            incident_owner: string | null;
            internal_notes: string | null;
            public_status_message: string | null;
            timeline: Json;
            resolution_notes: string | null;
            resolved_at: string | null;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            title: string;
            severity?: string;
            description?: string | null;
            affected_services?: string[];
            start_time?: string;
            current_status?: string;
            incident_owner?: string | null;
            internal_notes?: string | null;
            public_status_message?: string | null;
            timeline?: Json;
            resolution_notes?: string | null;
            resolved_at?: string | null;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            title?: string | null;
            severity?: string | null;
            description?: string | null;
            affected_services?: string[] | null;
            start_time?: string | null;
            current_status?: string | null;
            incident_owner?: string | null;
            internal_notes?: string | null;
            public_status_message?: string | null;
            timeline?: Json | null;
            resolution_notes?: string | null;
            resolved_at?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_incidents_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        legacy_redirects: {
            Row: {
            from_path: string;
            to_path: string;
            created_at: string;
            };
            Insert: {
            from_path: string;
            to_path: string;
            created_at?: string;
            };
            Update: {
            from_path?: string | null;
            to_path?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        listing_conversation_messages: {
            Row: {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            conversation_id?: string | null;
            sender_id?: string | null;
            body?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_listing_conversation_messages_conversation_id_fkey",
                    columns: ["conversation_id"],
                    isOneToOne: false,
                    referencedRelation: "listing_conversations",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_listing_conversation_messages_sender_id_fkey",
                    columns: ["sender_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        listing_conversations: {
            Row: {
            id: string;
            content_item_id: string;
            buyer_id: string;
            seller_id: string;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            buyer_id: string;
            seller_id: string;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            buyer_id?: string | null;
            seller_id?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_listing_conversations_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_listing_conversations_buyer_id_fkey",
                    columns: ["buyer_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_listing_conversations_seller_id_fkey",
                    columns: ["seller_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        listing_ratings: {
            Row: {
            user_id: string;
            content_item_id: string;
            stars: number;
            created_at: string;
            };
            Insert: {
            user_id: string;
            content_item_id: string;
            stars: number;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            content_item_id?: string | null;
            stars?: number | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_listing_ratings_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_listing_ratings_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        listings: {
            Row: {
            content_item_id: string;
            price: number | null;
            currency: string | null;
            listing_status: string;
            contact_phone: string | null;
            contact_email: string | null;
            whatsapp_number: string | null;
            seller_name: string | null;
            seller_is_verified: boolean;
            sold_at: string | null;
            renewed_at: string | null;
            };
            Insert: {
            content_item_id: string;
            price?: number | null;
            currency?: string | null;
            listing_status?: string;
            contact_phone?: string | null;
            contact_email?: string | null;
            whatsapp_number?: string | null;
            seller_name?: string | null;
            seller_is_verified?: boolean;
            sold_at?: string | null;
            renewed_at?: string | null;
            };
            Update: {
            content_item_id?: string | null;
            price?: number | null;
            currency?: string | null;
            listing_status?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
            whatsapp_number?: string | null;
            seller_name?: string | null;
            seller_is_verified?: boolean | null;
            sold_at?: string | null;
            renewed_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_listings_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        location_slug_redirects: {
            Row: {
            id: string;
            location_id: string | null;
            old_slug: string;
            created_by: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            location_id?: string | null;
            old_slug: string;
            created_by?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            location_id?: string | null;
            old_slug?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_location_slug_redirects_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_location_slug_redirects_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        locations: {
            Row: {
            id: string;
            parent_id: string | null;
            name: string;
            slug: string;
            locale: string;
            latitude: number | null;
            longitude: number | null;
            location_type: string | null;
            description: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            parent_id?: string | null;
            name: string;
            slug: string;
            locale?: string;
            latitude?: number | null;
            longitude?: number | null;
            location_type?: string | null;
            description?: string | null;
            is_active?: boolean;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            parent_id?: string | null;
            name?: string | null;
            slug?: string | null;
            locale?: string | null;
            latitude?: number | null;
            longitude?: number | null;
            location_type?: string | null;
            description?: string | null;
            is_active?: boolean | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_locations_parent_id_fkey",
                    columns: ["parent_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
            ];
        }
        media_assets: {
            Row: {
            id: string;
            content_item_id: string | null;
            uploaded_by: string | null;
            kind: string;
            provider: string;
            destination: string;
            storage_key: string | null;
            public_url: string | null;
            mime_type: string | null;
            file_size_bytes: number | null;
            width: number | null;
            height: number | null;
            duration_seconds: number | null;
            caption: string | null;
            photographer_credit: string | null;
            alt_text: string | null;
            rights_holder: string | null;
            rights_status: string | null;
            rights_notes: string | null;
            sort_order: number;
            is_cover: boolean;
            backup_requested_at: string | null;
            backed_up_at: string | null;
            created_at: string;
            updated_at: string;
            checksum: string | null;
            verification_status: string;
            verification_error: string | null;
            backup_sha256: string | null;
            backup_verified_at: string | null;
            archived_at: string | null;
            archived_by: string | null;
            crop: Json | null;
            resize_width: number | null;
            resize_height: number | null;
            resized_at: string | null;
            captured_at: string | null;
            location_text: string | null;
            creator: string | null;
            copyright_holder: string | null;
            license: string | null;
            usage_permission: string | null;
            consent_status: string | null;
            };
            Insert: {
            id?: string;
            content_item_id?: string | null;
            uploaded_by?: string | null;
            kind?: string;
            provider?: string;
            destination?: string;
            storage_key?: string | null;
            public_url?: string | null;
            mime_type?: string | null;
            file_size_bytes?: number | null;
            width?: number | null;
            height?: number | null;
            duration_seconds?: number | null;
            caption?: string | null;
            photographer_credit?: string | null;
            alt_text?: string | null;
            rights_holder?: string | null;
            rights_status?: string | null;
            rights_notes?: string | null;
            sort_order?: number;
            is_cover?: boolean;
            backup_requested_at?: string | null;
            backed_up_at?: string | null;
            created_at?: string;
            updated_at?: string;
            checksum?: string | null;
            verification_status?: string;
            verification_error?: string | null;
            backup_sha256?: string | null;
            backup_verified_at?: string | null;
            archived_at?: string | null;
            archived_by?: string | null;
            crop?: Json | null;
            resize_width?: number | null;
            resize_height?: number | null;
            resized_at?: string | null;
            captured_at?: string | null;
            location_text?: string | null;
            creator?: string | null;
            copyright_holder?: string | null;
            license?: string | null;
            usage_permission?: string | null;
            consent_status?: string | null;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            uploaded_by?: string | null;
            kind?: string | null;
            provider?: string | null;
            destination?: string | null;
            storage_key?: string | null;
            public_url?: string | null;
            mime_type?: string | null;
            file_size_bytes?: number | null;
            width?: number | null;
            height?: number | null;
            duration_seconds?: number | null;
            caption?: string | null;
            photographer_credit?: string | null;
            alt_text?: string | null;
            rights_holder?: string | null;
            rights_status?: string | null;
            rights_notes?: string | null;
            sort_order?: number | null;
            is_cover?: boolean | null;
            backup_requested_at?: string | null;
            backed_up_at?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            checksum?: string | null;
            verification_status?: string | null;
            verification_error?: string | null;
            backup_sha256?: string | null;
            backup_verified_at?: string | null;
            archived_at?: string | null;
            archived_by?: string | null;
            crop?: Json | null;
            resize_width?: number | null;
            resize_height?: number | null;
            resized_at?: string | null;
            captured_at?: string | null;
            location_text?: string | null;
            creator?: string | null;
            copyright_holder?: string | null;
            license?: string | null;
            usage_permission?: string | null;
            consent_status?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_media_assets_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_media_assets_uploaded_by_fkey",
                    columns: ["uploaded_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        media_text_variants: {
            Row: {
            media_id: string;
            locale: string;
            voice: string;
            caption: string | null;
            alt_text: string | null;
            share_text: string | null;
            };
            Insert: {
            media_id: string;
            locale: string;
            voice?: string;
            caption?: string | null;
            alt_text?: string | null;
            share_text?: string | null;
            };
            Update: {
            media_id?: string | null;
            locale?: string | null;
            voice?: string | null;
            caption?: string | null;
            alt_text?: string | null;
            share_text?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_media_text_variants_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        moderation_log: {
            Row: {
            id: string;
            content_item_id: string | null;
            submission_id: string | null;
            actor_id: string | null;
            action: string;
            from_status: string | null;
            to_status: string | null;
            notes: string | null;
            created_at: string;
            entity_type: string | null;
            entity_id: string | null;
            request_id: string | null;
            ip_hash: string | null;
            };
            Insert: {
            id?: string;
            content_item_id?: string | null;
            submission_id?: string | null;
            actor_id?: string | null;
            action: string;
            from_status?: string | null;
            to_status?: string | null;
            notes?: string | null;
            created_at?: string;
            entity_type?: string | null;
            entity_id?: string | null;
            request_id?: string | null;
            ip_hash?: string | null;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            submission_id?: string | null;
            actor_id?: string | null;
            action?: string | null;
            from_status?: string | null;
            to_status?: string | null;
            notes?: string | null;
            created_at?: string | null;
            entity_type?: string | null;
            entity_id?: string | null;
            request_id?: string | null;
            ip_hash?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_moderation_log_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_moderation_log_submission_id_fkey",
                    columns: ["submission_id"],
                    isOneToOne: false,
                    referencedRelation: "submissions",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_moderation_log_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        notices: {
            Row: {
            content_item_id: string;
            notice_type: string;
            organization_name: string | null;
            contact_phone: string | null;
            contact_email: string | null;
            notice_date: string | null;
            expiry_date: string | null;
            is_official: boolean;
            };
            Insert: {
            content_item_id: string;
            notice_type: string;
            organization_name?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
            notice_date?: string | null;
            expiry_date?: string | null;
            is_official?: boolean;
            };
            Update: {
            content_item_id?: string | null;
            notice_type?: string | null;
            organization_name?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
            notice_date?: string | null;
            expiry_date?: string | null;
            is_official?: boolean | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_notices_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        notification_outbox: {
            Row: {
            id: string;
            created_at: string;
            audience: string;
            recipient_user_id: string | null;
            event: string;
            locale: string;
            title: string | null;
            title_fr: string | null;
            body: string | null;
            body_fr: string | null;
            data: Json | null;
            status: string;
            attempts: number;
            next_attempt_at: string;
            sent_at: string | null;
            channels_sent: string[] | null;
            last_error: string | null;
            };
            Insert: {
            id?: string;
            created_at?: string;
            audience: string;
            recipient_user_id?: string | null;
            event: string;
            locale?: string;
            title?: string | null;
            title_fr?: string | null;
            body?: string | null;
            body_fr?: string | null;
            data?: Json | null;
            status?: string;
            attempts?: number;
            next_attempt_at?: string;
            sent_at?: string | null;
            channels_sent?: string[] | null;
            last_error?: string | null;
            };
            Update: {
            id?: string | null;
            created_at?: string | null;
            audience?: string | null;
            recipient_user_id?: string | null;
            event?: string | null;
            locale?: string | null;
            title?: string | null;
            title_fr?: string | null;
            body?: string | null;
            body_fr?: string | null;
            data?: Json | null;
            status?: string | null;
            attempts?: number | null;
            next_attempt_at?: string | null;
            sent_at?: string | null;
            channels_sent?: string[] | null;
            last_error?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_notification_outbox_recipient_user_id_fkey",
                    columns: ["recipient_user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        notification_prefs: {
            Row: {
            user_id: string;
            inapp: boolean;
            email: boolean;
            whatsapp: boolean;
            locale: string;
            updated_at: string;
            quiet_start: number | null;
            quiet_end: number | null;
            };
            Insert: {
            user_id: string;
            inapp?: boolean;
            email?: boolean;
            whatsapp?: boolean;
            locale?: string;
            updated_at?: string;
            quiet_start?: number | null;
            quiet_end?: number | null;
            };
            Update: {
            user_id?: string | null;
            inapp?: boolean | null;
            email?: boolean | null;
            whatsapp?: boolean | null;
            locale?: string | null;
            updated_at?: string | null;
            quiet_start?: number | null;
            quiet_end?: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_notification_prefs_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        notifications: {
            Row: {
            id: string;
            user_id: string;
            type: string;
            title: string;
            body: string | null;
            data: Json | null;
            read_at: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            user_id: string;
            type: string;
            title: string;
            body?: string | null;
            data?: Json | null;
            read_at?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            type?: string | null;
            title?: string | null;
            body?: string | null;
            data?: Json | null;
            read_at?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_notifications_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        photo_pairs: {
            Row: {
            id: string;
            location_id: string;
            then_image_id: string;
            now_image_id: string;
            then_caption: string | null;
            now_caption: string | null;
            locale: string;
            is_published: boolean;
            sort_order: number;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            location_id: string;
            then_image_id: string;
            now_image_id: string;
            then_caption?: string | null;
            now_caption?: string | null;
            locale?: string;
            is_published?: boolean;
            sort_order?: number;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            location_id?: string | null;
            then_image_id?: string | null;
            now_image_id?: string | null;
            then_caption?: string | null;
            now_caption?: string | null;
            locale?: string | null;
            is_published?: boolean | null;
            sort_order?: number | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_photo_pairs_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_photo_pairs_then_image_id_fkey",
                    columns: ["then_image_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_photo_pairs_now_image_id_fkey",
                    columns: ["now_image_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        policy_acceptances: {
            Row: {
            id: string;
            user_id: string;
            policy_version_id: string;
            accepted_at: string;
            ip_hash: string | null;
            };
            Insert: {
            id?: string;
            user_id: string;
            policy_version_id: string;
            accepted_at?: string;
            ip_hash?: string | null;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            policy_version_id?: string | null;
            accepted_at?: string | null;
            ip_hash?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_policy_acceptances_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_policy_acceptances_policy_version_id_fkey",
                    columns: ["policy_version_id"],
                    isOneToOne: false,
                    referencedRelation: "policy_versions",
                    referencedColumns: ["id"],
                },
            ];
        }
        policy_versions: {
            Row: {
            id: string;
            policy_type: string;
            version: string;
            locale: string;
            content: string;
            published_at: string;
            is_current: boolean;
            };
            Insert: {
            id?: string;
            policy_type: string;
            version: string;
            locale?: string;
            content: string;
            published_at?: string;
            is_current?: boolean;
            };
            Update: {
            id?: string | null;
            policy_type?: string | null;
            version?: string | null;
            locale?: string | null;
            content?: string | null;
            published_at?: string | null;
            is_current?: boolean | null;
            };
            Relationships: [];
        }
        poll_options: {
            Row: {
            id: string;
            poll_id: string;
            label: string;
            sort_order: number;
            };
            Insert: {
            id?: string;
            poll_id: string;
            label: string;
            sort_order?: number;
            };
            Update: {
            id?: string | null;
            poll_id?: string | null;
            label?: string | null;
            sort_order?: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_poll_options_poll_id_fkey",
                    columns: ["poll_id"],
                    isOneToOne: false,
                    referencedRelation: "polls",
                    referencedColumns: ["id"],
                },
            ];
        }
        poll_votes: {
            Row: {
            id: string;
            poll_id: string;
            option_id: string;
            voter_token: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            poll_id: string;
            option_id: string;
            voter_token: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            poll_id?: string | null;
            option_id?: string | null;
            voter_token?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_poll_votes_poll_id_fkey",
                    columns: ["poll_id"],
                    isOneToOne: false,
                    referencedRelation: "polls",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_poll_votes_option_id_fkey",
                    columns: ["option_id"],
                    isOneToOne: false,
                    referencedRelation: "poll_options",
                    referencedColumns: ["id"],
                },
            ];
        }
        polls: {
            Row: {
            id: string;
            slug: string | null;
            question: string;
            locale: string;
            content_item_id: string | null;
            location_id: string | null;
            is_active: boolean;
            closes_at: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            slug?: string | null;
            question: string;
            locale?: string;
            content_item_id?: string | null;
            location_id?: string | null;
            is_active?: boolean;
            closes_at?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            slug?: string | null;
            question?: string | null;
            locale?: string | null;
            content_item_id?: string | null;
            location_id?: string | null;
            is_active?: boolean | null;
            closes_at?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_polls_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_polls_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
            ];
        }
        price_watches: {
            Row: {
            user_id: string;
            content_item_id: string;
            created_at: string;
            };
            Insert: {
            user_id: string;
            content_item_id: string;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            content_item_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_price_watches_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_price_watches_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        profiles: {
            Row: {
            id: string;
            display_name: string | null;
            full_name: string | null;
            bio: string | null;
            phone: string | null;
            email: string | null;
            avatar_url: string | null;
            location_id: string | null;
            is_verified: boolean;
            is_public: boolean;
            preferred_locale: string;
            preferred_voice: string;
            created_at: string;
            updated_at: string;
            is_suspended: boolean;
            is_banned: boolean;
            contributor_featured: boolean;
            contributor_bio_override: string | null;
            contributor_handle: string | null;
            contributor_consent_at: string | null;
            deleted_at: string | null;
            };
            Insert: {
            id: string;
            display_name?: string | null;
            full_name?: string | null;
            bio?: string | null;
            phone?: string | null;
            email?: string | null;
            avatar_url?: string | null;
            location_id?: string | null;
            is_verified?: boolean;
            is_public?: boolean;
            preferred_locale?: string;
            preferred_voice?: string;
            created_at?: string;
            updated_at?: string;
            is_suspended?: boolean;
            is_banned?: boolean;
            contributor_featured?: boolean;
            contributor_bio_override?: string | null;
            contributor_handle?: string | null;
            contributor_consent_at?: string | null;
            deleted_at?: string | null;
            };
            Update: {
            id?: string | null;
            display_name?: string | null;
            full_name?: string | null;
            bio?: string | null;
            phone?: string | null;
            email?: string | null;
            avatar_url?: string | null;
            location_id?: string | null;
            is_verified?: boolean | null;
            is_public?: boolean | null;
            preferred_locale?: string | null;
            preferred_voice?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            is_suspended?: boolean | null;
            is_banned?: boolean | null;
            contributor_featured?: boolean | null;
            contributor_bio_override?: string | null;
            contributor_handle?: string | null;
            contributor_consent_at?: string | null;
            deleted_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_profiles_location_id_fkey",
                    columns: ["location_id"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["id"],
                },
            ];
        }
        rate_limit_hits: {
            Row: {
            key: string;
            window_start: string;
            count: number;
            };
            Insert: {
            key: string;
            window_start: string;
            count?: number;
            };
            Update: {
            key?: string | null;
            window_start?: string | null;
            count?: number | null;
            };
            Relationships: [];
        }
        reports: {
            Row: {
            id: string;
            report_type: string;
            reporter_id: string | null;
            content_item_id: string | null;
            media_id: string | null;
            subject: string | null;
            description: string | null;
            evidence_url: string | null;
            status: string;
            assigned_to: string | null;
            resolution: string | null;
            created_at: string;
            updated_at: string;
            resolved_at: string | null;
            };
            Insert: {
            id?: string;
            report_type: string;
            reporter_id?: string | null;
            content_item_id?: string | null;
            media_id?: string | null;
            subject?: string | null;
            description?: string | null;
            evidence_url?: string | null;
            status?: string;
            assigned_to?: string | null;
            resolution?: string | null;
            created_at?: string;
            updated_at?: string;
            resolved_at?: string | null;
            };
            Update: {
            id?: string | null;
            report_type?: string | null;
            reporter_id?: string | null;
            content_item_id?: string | null;
            media_id?: string | null;
            subject?: string | null;
            description?: string | null;
            evidence_url?: string | null;
            status?: string | null;
            assigned_to?: string | null;
            resolution?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            resolved_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_reports_reporter_id_fkey",
                    columns: ["reporter_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_reports_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_reports_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_reports_assigned_to_fkey",
                    columns: ["assigned_to"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        saved_articles: {
            Row: {
            id: string;
            user_id: string;
            content_item_id: string;
            locale: string;
            saved_at: string;
            };
            Insert: {
            id?: string;
            user_id: string;
            content_item_id: string;
            locale?: string;
            saved_at?: string;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            content_item_id?: string | null;
            locale?: string | null;
            saved_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_saved_articles_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        saved_content: {
            Row: {
            user_id: string;
            content_item_id: string;
            created_at: string;
            };
            Insert: {
            user_id: string;
            content_item_id: string;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            content_item_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_saved_content_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_saved_content_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        site_settings: {
            Row: {
            key: string;
            value: string | null;
            updated_by: string | null;
            updated_at: string;
            };
            Insert: {
            key: string;
            value?: string | null;
            updated_by?: string | null;
            updated_at?: string;
            };
            Update: {
            key?: string | null;
            value?: string | null;
            updated_by?: string | null;
            updated_at?: string | null;
            };
            Relationships: [];
        }
        state_schedules: {
            Row: {
            id: string;
            state_id: string;
            label: string;
            start_month: number;
            start_day: number;
            end_month: number;
            end_day: number;
            enabled: boolean;
            last_action: string | null;
            last_run_at: string | null;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            state_id: string;
            label: string;
            start_month: number;
            start_day: number;
            end_month: number;
            end_day: number;
            enabled?: boolean;
            last_action?: string | null;
            last_run_at?: string | null;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            state_id?: string | null;
            label?: string | null;
            start_month?: number | null;
            start_day?: number | null;
            end_month?: number | null;
            end_day?: number | null;
            enabled?: boolean | null;
            last_action?: string | null;
            last_run_at?: string | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_state_schedules_state_id_fkey",
                    columns: ["state_id"],
                    isOneToOne: false,
                    referencedRelation: "system_states",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_state_schedules_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        storage_tasks: {
            Row: {
            id: string;
            media_id: string | null;
            task_type: string;
            status: string;
            attempts: number;
            last_error: string | null;
            created_at: string;
            completed_at: string | null;
            };
            Insert: {
            id?: string;
            media_id?: string | null;
            task_type: string;
            status?: string;
            attempts?: number;
            last_error?: string | null;
            created_at?: string;
            completed_at?: string | null;
            };
            Update: {
            id?: string | null;
            media_id?: string | null;
            task_type?: string | null;
            status?: string | null;
            attempts?: number | null;
            last_error?: string | null;
            created_at?: string | null;
            completed_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_storage_tasks_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        submission_escalations: {
            Row: {
            id: string;
            submission_id: string;
            reason: string;
            escalated_by: string;
            assigned_to: string | null;
            created_at: string;
            resolved_at: string | null;
            };
            Insert: {
            id?: string;
            submission_id: string;
            reason: string;
            escalated_by: string;
            assigned_to?: string | null;
            created_at?: string;
            resolved_at?: string | null;
            };
            Update: {
            id?: string | null;
            submission_id?: string | null;
            reason?: string | null;
            escalated_by?: string | null;
            assigned_to?: string | null;
            created_at?: string | null;
            resolved_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_submission_escalations_submission_id_fkey",
                    columns: ["submission_id"],
                    isOneToOne: false,
                    referencedRelation: "submissions",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submission_escalations_escalated_by_fkey",
                    columns: ["escalated_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submission_escalations_assigned_to_fkey",
                    columns: ["assigned_to"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        submission_media: {
            Row: {
            submission_id: string;
            media_id: string;
            };
            Insert: {
            submission_id: string;
            media_id: string;
            };
            Update: {
            submission_id?: string | null;
            media_id?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_submission_media_submission_id_fkey",
                    columns: ["submission_id"],
                    isOneToOne: false,
                    referencedRelation: "submissions",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submission_media_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
            ];
        }
        submission_reviews: {
            Row: {
            id: string;
            submission_id: string;
            reviewer_id: string | null;
            status_from: string | null;
            status_to: string;
            notes: string | null;
            review_type: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            submission_id: string;
            reviewer_id?: string | null;
            status_from?: string | null;
            status_to: string;
            notes?: string | null;
            review_type: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            submission_id?: string | null;
            reviewer_id?: string | null;
            status_from?: string | null;
            status_to?: string | null;
            notes?: string | null;
            review_type?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_submission_reviews_submission_id_fkey",
                    columns: ["submission_id"],
                    isOneToOne: false,
                    referencedRelation: "submissions",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submission_reviews_reviewer_id_fkey",
                    columns: ["reviewer_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        submissions: {
            Row: {
            id: string;
            submission_type: string;
            submitted_by: string | null;
            guest_name: string | null;
            guest_email: string | null;
            guest_phone: string | null;
            status: string;
            content_item_id: string | null;
            payload: Json | null;
            consent_confirmed: boolean;
            rights_confirmed: boolean;
            submitted_at: string;
            reviewed_at: string | null;
            reviewed_by: string | null;
            rejection_reason: string | null;
            internal_notes: string | null;
            assigned_editor_id: string | null;
            };
            Insert: {
            id?: string;
            submission_type: string;
            submitted_by?: string | null;
            guest_name?: string | null;
            guest_email?: string | null;
            guest_phone?: string | null;
            status?: string;
            content_item_id?: string | null;
            payload?: Json | null;
            consent_confirmed?: boolean;
            rights_confirmed?: boolean;
            submitted_at?: string;
            reviewed_at?: string | null;
            reviewed_by?: string | null;
            rejection_reason?: string | null;
            internal_notes?: string | null;
            assigned_editor_id?: string | null;
            };
            Update: {
            id?: string | null;
            submission_type?: string | null;
            submitted_by?: string | null;
            guest_name?: string | null;
            guest_email?: string | null;
            guest_phone?: string | null;
            status?: string | null;
            content_item_id?: string | null;
            payload?: Json | null;
            consent_confirmed?: boolean | null;
            rights_confirmed?: boolean | null;
            submitted_at?: string | null;
            reviewed_at?: string | null;
            reviewed_by?: string | null;
            rejection_reason?: string | null;
            internal_notes?: string | null;
            assigned_editor_id?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_submissions_submitted_by_fkey",
                    columns: ["submitted_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submissions_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_submissions_reviewed_by_fkey",
                    columns: ["reviewed_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        system_state_events: {
            Row: {
            id: string;
            state_id: string;
            action: string;
            previous_state_id: string | null;
            reason: string | null;
            actor_id: string | null;
            created_at: string;
            };
            Insert: {
            id?: string;
            state_id: string;
            action: string;
            previous_state_id?: string | null;
            reason?: string | null;
            actor_id?: string | null;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            state_id?: string | null;
            action?: string | null;
            previous_state_id?: string | null;
            reason?: string | null;
            actor_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_system_state_events_state_id_fkey",
                    columns: ["state_id"],
                    isOneToOne: false,
                    referencedRelation: "system_states",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_system_state_events_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        system_state_themes: {
            Row: {
            state_id: string;
            theme_id: string;
            created_at: string;
            created_by: string | null;
            };
            Insert: {
            state_id: string;
            theme_id: string;
            created_at?: string;
            created_by?: string | null;
            };
            Update: {
            state_id?: string | null;
            theme_id?: string | null;
            created_at?: string | null;
            created_by?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_system_state_themes_state_id_fkey",
                    columns: ["state_id"],
                    isOneToOne: false,
                    referencedRelation: "system_states",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_system_state_themes_theme_id_fkey",
                    columns: ["theme_id"],
                    isOneToOne: false,
                    referencedRelation: "brand_themes",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_system_state_themes_created_by_fkey",
                    columns: ["created_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        system_states: {
            Row: {
            id: string;
            name: string;
            severity: string;
            active: boolean;
            precedence: number;
            visual_profile: string;
            affected_modules: string[];
            behavior_profile: Json;
            accessibility_profile: string;
            activated_at: string | null;
            activated_by: string | null;
            expires_at: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id: string;
            name: string;
            severity?: string;
            active?: boolean;
            precedence?: number;
            visual_profile?: string;
            affected_modules?: string[];
            behavior_profile?: Json;
            accessibility_profile?: string;
            activated_at?: string | null;
            activated_by?: string | null;
            expires_at?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            name?: string | null;
            severity?: string | null;
            active?: boolean | null;
            precedence?: number | null;
            visual_profile?: string | null;
            affected_modules?: string[] | null;
            behavior_profile?: Json | null;
            accessibility_profile?: string | null;
            activated_at?: string | null;
            activated_by?: string | null;
            expires_at?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_system_states_activated_by_fkey",
                    columns: ["activated_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        tag_translations: {
            Row: {
            tag_id: string;
            locale: string;
            name: string;
            };
            Insert: {
            tag_id: string;
            locale: string;
            name: string;
            };
            Update: {
            tag_id?: string | null;
            locale?: string | null;
            name?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_tag_translations_tag_id_fkey",
                    columns: ["tag_id"],
                    isOneToOne: false,
                    referencedRelation: "tags",
                    referencedColumns: ["id"],
                },
            ];
        }
        tags: {
            Row: {
            id: string;
            slug: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            slug: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            slug?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        takedown_requests: {
            Row: {
            id: string;
            media_id: string;
            content_item_id: string | null;
            claimant_name: string;
            claimant_email: string | null;
            claimant_phone: string | null;
            rights_basis: string;
            description: string | null;
            evidence_url: string | null;
            status: string;
            assigned_to: string | null;
            decision: string | null;
            decision_reason: string | null;
            created_at: string;
            resolved_at: string | null;
            };
            Insert: {
            id?: string;
            media_id: string;
            content_item_id?: string | null;
            claimant_name: string;
            claimant_email?: string | null;
            claimant_phone?: string | null;
            rights_basis: string;
            description?: string | null;
            evidence_url?: string | null;
            status?: string;
            assigned_to?: string | null;
            decision?: string | null;
            decision_reason?: string | null;
            created_at?: string;
            resolved_at?: string | null;
            };
            Update: {
            id?: string | null;
            media_id?: string | null;
            content_item_id?: string | null;
            claimant_name?: string | null;
            claimant_email?: string | null;
            claimant_phone?: string | null;
            rights_basis?: string | null;
            description?: string | null;
            evidence_url?: string | null;
            status?: string | null;
            assigned_to?: string | null;
            decision?: string | null;
            decision_reason?: string | null;
            created_at?: string | null;
            resolved_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_takedown_requests_media_id_fkey",
                    columns: ["media_id"],
                    isOneToOne: false,
                    referencedRelation: "media_assets",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_takedown_requests_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_takedown_requests_assigned_to_fkey",
                    columns: ["assigned_to"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        timeline_entries: {
            Row: {
            id: string;
            content_item_id: string;
            timestamp: string;
            title: string;
            body: string;
            locale: string;
            is_published: boolean;
            sort_order: number;
            created_by: string | null;
            created_at: string;
            updated_at: string;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            timestamp?: string;
            title: string;
            body: string;
            locale?: string;
            is_published?: boolean;
            sort_order?: number;
            created_by?: string | null;
            created_at?: string;
            updated_at?: string;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            timestamp?: string | null;
            title?: string | null;
            body?: string | null;
            locale?: string | null;
            is_published?: boolean | null;
            sort_order?: number | null;
            created_by?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_timeline_entries_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        translation_jobs: {
            Row: {
            id: string;
            content_item_id: string;
            target_locale: string;
            source_locale: string;
            status: string;
            translator_id: string | null;
            reviewer_id: string | null;
            error_message: string | null;
            created_at: string;
            completed_at: string | null;
            };
            Insert: {
            id?: string;
            content_item_id: string;
            target_locale: string;
            source_locale: string;
            status?: string;
            translator_id?: string | null;
            reviewer_id?: string | null;
            error_message?: string | null;
            created_at?: string;
            completed_at?: string | null;
            };
            Update: {
            id?: string | null;
            content_item_id?: string | null;
            target_locale?: string | null;
            source_locale?: string | null;
            status?: string | null;
            translator_id?: string | null;
            reviewer_id?: string | null;
            error_message?: string | null;
            created_at?: string | null;
            completed_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_translation_jobs_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_translation_jobs_translator_id_fkey",
                    columns: ["translator_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_translation_jobs_reviewer_id_fkey",
                    columns: ["reviewer_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        translation_memory: {
            Row: {
            id: string;
            source_text_hash: string;
            source_locale: string;
            target_locale: string;
            source_text: string;
            target_text: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            source_text_hash: string;
            source_locale: string;
            target_locale: string;
            source_text: string;
            target_text: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            source_text_hash?: string | null;
            source_locale?: string | null;
            target_locale?: string | null;
            source_text?: string | null;
            target_text?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        two_person_approvals: {
            Row: {
            id: string;
            action: string;
            actor_id: string;
            resource_type: string;
            resource_id: string | null;
            reason: string | null;
            approver_id: string | null;
            status: string;
            created_at: string;
            expires_at: string;
            responded_at: string | null;
            };
            Insert: {
            id?: string;
            action: string;
            actor_id: string;
            resource_type: string;
            resource_id?: string | null;
            reason?: string | null;
            approver_id?: string | null;
            status?: string;
            created_at?: string;
            expires_at: string;
            responded_at?: string | null;
            };
            Update: {
            id?: string | null;
            action?: string | null;
            actor_id?: string | null;
            resource_type?: string | null;
            resource_id?: string | null;
            reason?: string | null;
            approver_id?: string | null;
            status?: string | null;
            created_at?: string | null;
            expires_at?: string | null;
            responded_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_two_person_approvals_actor_id_fkey",
                    columns: ["actor_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_two_person_approvals_approver_id_fkey",
                    columns: ["approver_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        user_admin_roles: {
            Row: {
            id: string;
            user_id: string;
            role: string;
            assigned_by: string | null;
            assigned_at: string;
            expires_at: string | null;
            };
            Insert: {
            id?: string;
            user_id: string;
            role: string;
            assigned_by?: string | null;
            assigned_at?: string;
            expires_at?: string | null;
            };
            Update: {
            id?: string | null;
            user_id?: string | null;
            role?: string | null;
            assigned_by?: string | null;
            assigned_at?: string | null;
            expires_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_user_admin_roles_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_user_admin_roles_assigned_by_fkey",
                    columns: ["assigned_by"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        user_blocks: {
            Row: {
            id: string;
            blocker_id: string;
            blocked_id: string;
            created_at: string;
            };
            Insert: {
            id?: string;
            blocker_id: string;
            blocked_id: string;
            created_at?: string;
            };
            Update: {
            id?: string | null;
            blocker_id?: string | null;
            blocked_id?: string | null;
            created_at?: string | null;
            };
            Relationships: [];
        }
        user_place_preferences: {
            Row: {
            user_id: string;
            place_slug: string;
            locale: string;
            updated_at: string;
            };
            Insert: {
            user_id: string;
            place_slug: string;
            locale?: string;
            updated_at?: string;
            };
            Update: {
            user_id?: string | null;
            place_slug?: string | null;
            locale?: string | null;
            updated_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_user_place_preferences_place_slug_fkey",
                    columns: ["place_slug"],
                    isOneToOne: false,
                    referencedRelation: "locations",
                    referencedColumns: ["slug"],
                },
            ];
        }
        user_roles: {
            Row: {
            user_id: string;
            role: string;
            created_at: string;
            };
            Insert: {
            user_id: string;
            role: string;
            created_at?: string;
            };
            Update: {
            user_id?: string | null;
            role?: string | null;
            created_at?: string | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_user_roles_user_id_fkey",
                    columns: ["user_id"],
                    isOneToOne: false,
                    referencedRelation: "profiles",
                    referencedColumns: ["id"],
                },
            ];
        }
        };
        Views: {
        poll_results: {
            Row: {
            poll_id: string | null;
            option_id: string | null;
            votes: number | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_poll_results_poll_id_fkey",
                    columns: ["poll_id"],
                    isOneToOne: false,
                    referencedRelation: "polls",
                    referencedColumns: ["id"],
                },
                {
                    foreignKeyName: "public_poll_results_option_id_fkey",
                    columns: ["option_id"],
                    isOneToOne: false,
                    referencedRelation: "poll_options",
                    referencedColumns: ["id"],
                },
            ];
        }
        public_listings_safe: {
            Row: {
            content_item_id: string | null;
            price: number | null;
            currency: string | null;
            listing_status: "active" | "sold" | "expired" | "removed" | "draft" | "pending" | null;
            has_phone: boolean | null;
            has_email: boolean | null;
            has_whatsapp: boolean | null;
            };
            Relationships: [
                {
                    foreignKeyName: "public_public_listings_safe_content_item_id_fkey",
                    columns: ["content_item_id"],
                    isOneToOne: false,
                    referencedRelation: "content_items",
                    referencedColumns: ["id"],
                },
            ];
        }
        public_profiles: {
            Row: {
            id: string | null;
            display_name: string | null;
            avatar_url: string | null;
            bio: string | null;
            created_at: string | null;
            };
            Relationships: [];
        }
        };
        Functions: {
        admin_delete_category: {
            Args: {
                p_category_id: string;
                p_reassign_to: string;
                p_actor_id: string;
            };
            Returns: undefined;
        }
        admin_delete_content_item: {
            Args: {
                p_content_item_id: string;
                p_actor_id: string;
                p_note: string;
            };
            Returns: undefined;
        }
        admin_delete_location: {
            Args: {
                p_location_id: string;
                p_reassign_to: string;
                p_actor_id: string;
            };
            Returns: undefined;
        }
        analytics_bump: {
            Args: {
                p_surface: string;
                p_locale?: string;
                p_place?: string;
                p_delta?: number;
            };
            Returns: undefined;
        }
        check_rate_limit: {
            Args: {
                p_key: string;
                p_max: number;
                p_window_seconds: number;
            };
            Returns: boolean;
        }
        content_share_bump: {
            Args: {
                p_id: string;
            };
            Returns: undefined;
        }
        content_view_bump: {
            Args: {
                p_id: string;
            };
            Returns: undefined;
        }
        db_maintenance_report: {
            Args: {
                p_purge_older_than_seconds?: number;
            };
            Returns: Json;
        }
        digest_freeze: {
            Args: {
                p_issue_date: string;
            };
            Returns: Json;
        }
        digest_mark_sent: {
            Args: {
                p_issue_date: string;
            };
            Returns: number;
        }
        digest_slot_for_item: {
            Args: {
                p_item: string;
            };
            Returns: undefined;
        }
        expire_ad_campaigns: {
            Args: Record<string, never>;
            Returns: number;
        }
        has_role: {
            Args: {
                user_id: string;
                required_role: string;
            };
            Returns: boolean;
        }
        immutable_unaccent: {
            Args: {
                value: string;
            };
            Returns: string;
        }
        increment_ad_event: {
            Args: {
                p_campaign_id: string;
                p_event_type: string;
                p_session_hash?: string | null;
                p_metadata?: Json | null;
            };
            Returns: undefined;
        }
        is_admin: {
            Args: Record<string, never>;
            Returns: boolean;
        }
        is_advertiser: {
            Args: Record<string, never>;
            Returns: boolean;
        }
        is_blocked_between: {
            Args: {
                a: string;
                b: string;
            };
            Returns: boolean;
        }
        is_staff: {
            Args: Record<string, never>;
            Returns: boolean;
        }
        release_backup_lease: {
            Args: {
                p_job_name: string;
                p_owner: string;
                p_result?: Json | null;
            };
            Returns: undefined;
        }
        search_content: {
            Args: {
                p_q: string;
                p_locale?: string;
                p_types?: string[] | null;
                p_location?: string | null;
                p_category?: string | null;
                p_from?: string | null;
                p_to?: string | null;
                p_limit?: number;
            };
            Returns: {
                item_id: string;
                rank: number;
                headline_title: string;
                headline_excerpt: string;
            }[];
        }
        suggest_content: {
            Args: {
                p_q: string;
                p_locale?: string;
                p_limit?: number;
            };
            Returns: {
                item_id: string;
                title: string;
                item_type: string;
                slug: string;
            }[];
        }
        try_acquire_backup_lease: {
            Args: {
                p_job_name: string;
                p_owner: string;
                p_lease_seconds?: number;
            };
            Returns: boolean;
        }
        };
    };
};
