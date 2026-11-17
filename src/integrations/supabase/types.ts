export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      calendar_calendars: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          timezone: string;
          slot_duration_minutes: number;
          buffer_minutes: number;
          daily_capacity: number;
          availability: Json;
          is_default: boolean;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          timezone?: string;
          slot_duration_minutes?: number;
          buffer_minutes?: number;
          daily_capacity?: number;
          availability?: Json;
          is_default?: boolean;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          timezone?: string;
          slot_duration_minutes?: number;
          buffer_minutes?: number;
          daily_capacity?: number;
          availability?: Json;
          is_default?: boolean;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calendar_appointments: {
        Row: {
          id: string;
          workspace_id: string;
          calendar_id: string;
          lead_id: string | null;
          chat_id: string | null;
          agent_id: string | null;
          title: string;
          notes: string | null;
          starts_at: string;
          ends_at: string;
          status: string;
          source: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          calendar_id: string;
          lead_id?: string | null;
          chat_id?: string | null;
          agent_id?: string | null;
          title: string;
          notes?: string | null;
          starts_at: string;
          ends_at: string;
          status?: string;
          source?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          calendar_id?: string;
          lead_id?: string | null;
          chat_id?: string | null;
          agent_id?: string | null;
          title?: string;
          notes?: string | null;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          source?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_tags: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          color: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          color?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          color?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_lead_tags: {
        Row: { workspace_id: string; lead_id: string; tag_id: string; created_at: string };
        Insert: { workspace_id: string; lead_id: string; tag_id: string; created_at?: string };
        Update: { workspace_id?: string; lead_id?: string; tag_id?: string; created_at?: string };
        Relationships: [];
      };
      automation_agent_runs: {
        Row: {
          agent_id: string;
          chat_id: string | null;
          completed_at: string | null;
          error: string | null;
          id: string;
          input_excerpt: string | null;
          output_excerpt: string | null;
          provider_request_id: string | null;
          started_at: string;
          status: string;
          trigger_message_id: string | null;
          workspace_id: string;
        };
        Insert: {
          agent_id: string;
          chat_id?: string | null;
          completed_at?: string | null;
          error?: string | null;
          id?: string;
          input_excerpt?: string | null;
          output_excerpt?: string | null;
          provider_request_id?: string | null;
          started_at?: string;
          status?: string;
          trigger_message_id?: string | null;
          workspace_id: string;
        };
        Update: {
          agent_id?: string;
          chat_id?: string | null;
          completed_at?: string | null;
          error?: string | null;
          id?: string;
          input_excerpt?: string | null;
          output_excerpt?: string | null;
          provider_request_id?: string | null;
          started_at?: string;
          status?: string;
          trigger_message_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_agent_runs_workspace_agent_fkey";
            columns: ["workspace_id", "agent_id"];
            isOneToOne: false;
            referencedRelation: "automation_agents";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "automation_agent_runs_workspace_chat_fkey";
            columns: ["workspace_id", "chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "automation_agent_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_agent_runs_workspace_trigger_message_fkey";
            columns: ["workspace_id", "trigger_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      automation_agents: {
        Row: {
          allow_groups: boolean;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          instance_id: string | null;
          instructions: string;
          max_completion_tokens: number;
          model: string | null;
          name: string;
          provider: string;
          reply_mode: string;
          runtime_config: Json;
          temperature: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          allow_groups?: boolean;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          instance_id?: string | null;
          instructions: string;
          max_completion_tokens?: number;
          model?: string | null;
          name: string;
          provider?: string;
          reply_mode?: string;
          runtime_config?: Json;
          temperature?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          allow_groups?: boolean;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          instance_id?: string | null;
          instructions?: string;
          max_completion_tokens?: number;
          model?: string | null;
          name?: string;
          provider?: string;
          reply_mode?: string;
          runtime_config?: Json;
          temperature?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_agents_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_agents_workspace_instance_fkey";
            columns: ["workspace_id", "instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      crm_leads: {
        Row: {
          chat_id: string | null;
          company: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          email: string | null;
          id: string;
          last_contact_at: string | null;
          name: string;
          notes: string | null;
          owner_user_id: string | null;
          phone_e164: string | null;
          source: string;
          stage_id: string;
          updated_at: string;
          value_cents: number;
          workspace_id: string;
        };
        Insert: {
          chat_id?: string | null;
          company?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          email?: string | null;
          id?: string;
          last_contact_at?: string | null;
          name: string;
          notes?: string | null;
          owner_user_id?: string | null;
          phone_e164?: string | null;
          source?: string;
          stage_id: string;
          updated_at?: string;
          value_cents?: number;
          workspace_id: string;
        };
        Update: {
          chat_id?: string | null;
          company?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          email?: string | null;
          id?: string;
          last_contact_at?: string | null;
          name?: string;
          notes?: string | null;
          owner_user_id?: string | null;
          phone_e164?: string | null;
          source?: string;
          stage_id?: string;
          updated_at?: string;
          value_cents?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_leads_workspace_chat_fkey";
            columns: ["workspace_id", "chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "crm_leads_workspace_contact_fkey";
            columns: ["workspace_id", "contact_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_contacts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "crm_leads_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_workspace_stage_fkey";
            columns: ["workspace_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "crm_stages";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      crm_stages: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          position: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          position?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          position?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_stages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      follow_up_tasks: {
        Row: {
          chat_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          due_at: string;
          id: string;
          lead_id: string | null;
          note: string | null;
          owner_user_id: string | null;
          priority: string;
          status: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          chat_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at: string;
          id?: string;
          lead_id?: string | null;
          note?: string | null;
          owner_user_id?: string | null;
          priority?: string;
          status?: string;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          chat_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_at?: string;
          id?: string;
          lead_id?: string | null;
          note?: string | null;
          owner_user_id?: string | null;
          priority?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follow_up_tasks_workspace_chat_fkey";
            columns: ["workspace_id", "chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "follow_up_tasks_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follow_up_tasks_workspace_lead_fkey";
            columns: ["workspace_id", "lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      handover_requests: {
        Row: {
          accepted_at: string | null;
          assigned_to: string | null;
          chat_id: string;
          created_at: string;
          id: string;
          instance_id: string;
          priority: string;
          reason: string;
          requested_at: string;
          resolved_at: string | null;
          status: string;
          trigger_message_id: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          assigned_to?: string | null;
          chat_id: string;
          created_at?: string;
          id?: string;
          instance_id: string;
          priority?: string;
          reason?: string;
          requested_at?: string;
          resolved_at?: string | null;
          status?: string;
          trigger_message_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          assigned_to?: string | null;
          chat_id?: string;
          created_at?: string;
          id?: string;
          instance_id?: string;
          priority?: string;
          reason?: string;
          requested_at?: string;
          resolved_at?: string | null;
          status?: string;
          trigger_message_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      workspace_billing: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          external_customer_id: string | null;
          external_subscription_id: string | null;
          metadata: Json;
          plan_key: string | null;
          provider: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          metadata?: Json;
          plan_key?: string | null;
          provider?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          external_customer_id?: string | null;
          external_subscription_id?: string | null;
          metadata?: Json;
          plan_key?: string | null;
          provider?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_billing_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      chats: {
        Row: {
          ai_paused: boolean;
          archived: boolean;
          can_send: boolean;
          created_at: string;
          group_metadata: Json;
          id: string;
          identity_kind: string | null;
          instance_id: string | null;
          instance_name: string;
          is_admin: boolean;
          is_announcement: boolean;
          is_group: boolean;
          last_message: string | null;
          last_message_at: string;
          last_message_type: string;
          name: string | null;
          phone: string;
          phone_e164: string | null;
          pinned: boolean;
          profile_pic_url: string | null;
          remote_jid: string | null;
          tag: string | null;
          unread: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          ai_paused?: boolean;
          archived?: boolean;
          can_send?: boolean;
          created_at?: string;
          group_metadata?: Json;
          id?: string;
          identity_kind?: string | null;
          instance_id?: string | null;
          instance_name: string;
          is_admin?: boolean;
          is_announcement?: boolean;
          is_group?: boolean;
          last_message?: string | null;
          last_message_at?: string;
          last_message_type?: string;
          name?: string | null;
          phone: string;
          phone_e164?: string | null;
          pinned?: boolean;
          profile_pic_url?: string | null;
          remote_jid?: string | null;
          tag?: string | null;
          unread?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          ai_paused?: boolean;
          archived?: boolean;
          can_send?: boolean;
          created_at?: string;
          group_metadata?: Json;
          id?: string;
          identity_kind?: string | null;
          instance_id?: string | null;
          instance_name?: string;
          is_admin?: boolean;
          is_announcement?: boolean;
          is_group?: boolean;
          last_message?: string | null;
          last_message_at?: string;
          last_message_type?: string;
          name?: string | null;
          phone?: string;
          phone_e164?: string | null;
          pinned?: boolean;
          profile_pic_url?: string | null;
          remote_jid?: string | null;
          tag?: string | null;
          unread?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chats_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chats_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_identity_aliases: {
        Row: {
          alias_jid: string;
          canonical_jid: string;
          contact_id: string | null;
          created_at: string;
          id: string;
          instance_id: string;
          phone_e164: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          alias_jid: string;
          canonical_jid: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          instance_id: string;
          phone_e164?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          alias_jid?: string;
          canonical_jid?: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          instance_id?: string;
          phone_e164?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_identity_aliases_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_identity_aliases_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_identity_aliases_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      evolution_events: {
        Row: {
          attempts: number;
          event_key: string;
          event_type: string;
          id: string;
          instance_id: string | null;
          instance_name: string;
          last_error: string | null;
          next_attempt_at: string | null;
          payload: Json;
          processed_at: string | null;
          processing_at: string | null;
          received_at: string;
          request_id: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          event_key: string;
          event_type: string;
          id?: string;
          instance_id?: string | null;
          instance_name: string;
          last_error?: string | null;
          next_attempt_at?: string | null;
          payload?: Json;
          processed_at?: string | null;
          processing_at?: string | null;
          received_at?: string;
          request_id?: string | null;
          status?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          event_key?: string;
          event_type?: string;
          id?: string;
          instance_id?: string | null;
          instance_name?: string;
          last_error?: string | null;
          next_attempt_at?: string | null;
          payload?: Json;
          processed_at?: string | null;
          processing_at?: string | null;
          received_at?: string;
          request_id?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evolution_events_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evolution_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      group_participants: {
        Row: {
          chat_id: string;
          created_at: string;
          display_name: string | null;
          id: string;
          instance_id: string;
          participant_jid: string;
          phone_e164: string | null;
          profile_pic_url: string | null;
          role: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          chat_id: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_id: string;
          participant_jid: string;
          phone_e164?: string | null;
          profile_pic_url?: string | null;
          role?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_id?: string;
          participant_jid?: string;
          phone_e164?: string | null;
          profile_pic_url?: string | null;
          role?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_participants_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_participants_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_participants_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      inbox_events: {
        Row: {
          chat_id: string | null;
          created_at: string;
          entity_id: string | null;
          event_type: string;
          payload: Json;
          sequence: number;
          workspace_id: string;
        };
        Insert: {
          chat_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          event_type: string;
          payload?: Json;
          sequence?: never;
          workspace_id: string;
        };
        Update: {
          chat_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          event_type?: string;
          payload?: Json;
          sequence?: never;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbox_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          chat_id: string;
          client_message_id: string | null;
          created_at: string;
          external_id: string | null;
          id: string;
          instance_id: string | null;
          is_edited: boolean;
          is_gif: boolean;
          media_duration: number | null;
          media_filename: string | null;
          media_mimetype: string | null;
          media_url: string | null;
          quoted_message: Json | null;
          reactions: Json;
          read_local_at: string | null;
          read_receipt_error: string | null;
          read_receipt_sent_at: string | null;
          remote_jid: string | null;
          sender: string;
          sender_avatar: string | null;
          sender_name: string | null;
          sender_phone: string | null;
          status: string;
          text: string | null;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          chat_id: string;
          client_message_id?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instance_id?: string | null;
          is_edited?: boolean;
          is_gif?: boolean;
          media_duration?: number | null;
          media_filename?: string | null;
          media_mimetype?: string | null;
          media_url?: string | null;
          quoted_message?: Json | null;
          reactions?: Json;
          read_local_at?: string | null;
          read_receipt_error?: string | null;
          read_receipt_sent_at?: string | null;
          remote_jid?: string | null;
          sender?: string;
          sender_avatar?: string | null;
          sender_name?: string | null;
          sender_phone?: string | null;
          status?: string;
          text?: string | null;
          type?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          chat_id?: string;
          client_message_id?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instance_id?: string | null;
          is_edited?: boolean;
          is_gif?: boolean;
          media_duration?: number | null;
          media_filename?: string | null;
          media_mimetype?: string | null;
          media_url?: string | null;
          quoted_message?: Json | null;
          reactions?: Json;
          read_local_at?: string | null;
          read_receipt_error?: string | null;
          read_receipt_sent_at?: string | null;
          remote_jid?: string | null;
          sender?: string;
          sender_avatar?: string | null;
          sender_name?: string | null;
          sender_phone?: string | null;
          status?: string;
          text?: string | null;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      outbound_messages: {
        Row: {
          accepted_at: string | null;
          attempts: number;
          chat_id: string;
          client_message_id: string;
          confirmed_at: string | null;
          created_at: string;
          external_id: string | null;
          id: string;
          instance_id: string;
          last_error: string | null;
          payload: Json;
          remote_jid: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          attempts?: number;
          chat_id: string;
          client_message_id: string;
          confirmed_at?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instance_id: string;
          last_error?: string | null;
          payload?: Json;
          remote_jid: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          attempts?: number;
          chat_id?: string;
          client_message_id?: string;
          confirmed_at?: string | null;
          created_at?: string;
          external_id?: string | null;
          id?: string;
          instance_id?: string;
          last_error?: string | null;
          payload?: Json;
          remote_jid?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbound_messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_messages_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_contacts: {
        Row: {
          alternate_jid: string | null;
          created_at: string;
          id: string;
          identity_kind: string | null;
          instance_id: string | null;
          instance_name: string;
          is_saved: boolean;
          phone: string | null;
          profile_pic_url: string | null;
          push_name: string | null;
          remote_jid: string;
          saved_name: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          alternate_jid?: string | null;
          created_at?: string;
          id?: string;
          identity_kind?: string | null;
          instance_id?: string | null;
          instance_name: string;
          is_saved?: boolean;
          phone?: string | null;
          profile_pic_url?: string | null;
          push_name?: string | null;
          remote_jid: string;
          saved_name?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          alternate_jid?: string | null;
          created_at?: string;
          id?: string;
          identity_kind?: string | null;
          instance_id?: string | null;
          instance_name?: string;
          is_saved?: boolean;
          phone?: string | null;
          profile_pic_url?: string | null;
          push_name?: string | null;
          remote_jid?: string;
          saved_name?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_instances: {
        Row: {
          connected_at: string | null;
          connection_state: string;
          created_at: string;
          display_name: string | null;
          id: string;
          instance_name: string;
          phone: string | null;
          profile_pic_url: string | null;
          qr_code: string | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          connected_at?: string | null;
          connection_state?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_name: string;
          phone?: string | null;
          profile_pic_url?: string | null;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          connected_at?: string | null;
          connection_state?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          instance_name?: string;
          phone?: string | null;
          profile_pic_url?: string | null;
          qr_code?: string | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_presence: {
        Row: {
          id: string;
          instance_id: string | null;
          instance_name: string;
          phone: string;
          state: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          id?: string;
          instance_id?: string | null;
          instance_name: string;
          phone: string;
          state: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          id?: string;
          instance_id?: string | null;
          instance_name?: string;
          phone?: string;
          state?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_presence_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_presence_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          permissions: Json;
          status: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: string;
          permissions?: Json;
          status?: string;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          permissions?: Json;
          status?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_auth_rate_limit: {
        Args: {
          p_action: string;
          p_block_seconds: number;
          p_limit: number;
          p_scope_hash: string;
          p_window_seconds: number;
        };
        Returns: Json;
      };
      increment_chat_unread: {
        Args: { p_amount?: number; p_chat_id: string; p_workspace_id: string };
        Returns: number;
      };
      mark_chat_read: {
        Args: { p_chat_id: string; p_workspace_id: string };
        Returns: Json;
      };
      persist_inbox_message: {
        Args: {
          p_client_message_id: string;
          p_created_at: string;
          p_external_id: string;
          p_identity_kind: string;
          p_increment_unread: boolean;
          p_instance_name: string;
          p_is_group: boolean;
          p_media_duration: number;
          p_media_filename: string;
          p_media_mimetype: string;
          p_media_url: string;
          p_name: string;
          p_phone: string;
          p_profile_pic_url: string;
          p_quoted_message: Json;
          p_remote_jid: string;
          p_sender: string;
          p_sender_avatar: string;
          p_sender_name: string;
          p_sender_phone: string;
          p_status: string;
          p_text: string;
          p_type: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      user_has_workspace_access: {
        Args: { target_workspace_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
