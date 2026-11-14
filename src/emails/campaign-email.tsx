import { Body, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";

type Props = {
  bodyHtml: string;
  previewText: string;
  companyName: string | null;
  mailingAddress: string;
  includeFooter: boolean;
  includeUnsubscribe: boolean;
};

export function CampaignEmail({ bodyHtml, previewText, companyName, mailingAddress, includeFooter, includeUnsubscribe }: Props) {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, backgroundColor: "#f6f6f3", padding: "24px 12px", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: 0 }}>
          {/* Section renders its own table markup as children, so raw HTML must go in a plain element. */}
          <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          {includeFooter && <Section style={{ borderTop: "1px solid #eeeeea", padding: "18px 12px", textAlign: "center" }}>
            <Text style={{ margin: 0, color: "#777770", fontSize: "11px", lineHeight: "1.6" }}>
              {companyName ? `${companyName} · ` : ""}{mailingAddress}
              {includeUnsubscribe && <>{" · "}<Link href="{{{RESEND_UNSUBSCRIBE_URL}}}" style={{ color: "#1d4ed8" }}>Unsubscribe</Link></>}
            </Text>
          </Section>}
        </Container>
      </Body>
    </Html>
  );
}
